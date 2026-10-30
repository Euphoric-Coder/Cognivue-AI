import json
import logging
import re
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)

class QuestionGenerator:
    """
    Generates grounded candidate assessment questions using Gemini structured output
    strictly grounded in provided course evidence tokens ([EVIDENCE_1], etc.).
    Gemini does NOT emit DB IDs; backend maps tokens to trusted evidence records.
    """

    def __init__(self):
        if settings.gemini_api_key:
            self.client = genai.Client(api_key=settings.gemini_api_key)
        else:
            self.client = None

    def generate_candidate_questions(
        self,
        planned_slots: List[Dict[str, Any]],
        evidence_prompt_block: str,
        token_to_evidence: Dict[str, Dict[str, Any]],
        relationships: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Invokes Gemini to generate candidate questions matching planned slots.
        Returns candidate dicts with mapped trusted evidence records.
        """
        if not planned_slots:
            return []

        if not self.client:
            logger.info("Gemini API key not configured. Using deterministic grounded question generator.")
            return self._generate_offline_candidates(planned_slots, token_to_evidence, relationships)

        # Build prompt
        slots_desc = []
        for slot in planned_slots:
            tokens_str = ", ".join(slot.get("evidenceTokens", []))
            slots_desc.append(
                f"- Slot {slot['slotIndex']}: Concept '{slot['conceptName']}', "
                f"Type '{slot['targetType']}', Difficulty '{slot['targetDifficulty']}', "
                f"Assigned Evidence: [{tokens_str}]"
            )
        slots_block = "\n".join(slots_desc)

        rel_block = ""
        if relationships:
            rel_desc = [f"- {r.get('fromConceptName', '')} {r.get('relationType')} {r.get('toConceptName', '')}" for r in relationships[:10]]
            rel_block = "Concept Relationships in Course:\n" + "\n".join(rel_desc)

        system_instruction = (
            "You are an expert assessment author strictly grounded in the provided course material.\n"
            "Generate rigorous, high-quality assessment questions matching each requested slot.\n"
            "ABSOLUTE GROUNDING DIRECTIVE:\n"
            "Every question, option, correct answer, rubric, and explanation MUST BE DERIVED SOLELY from the provided evidence.\n"
            "Do NOT invent facts, rules, or assumptions not stated in the evidence.\n"
            "For MCQ questions: provide exactly 4 options with exactly 1 correct answer and 3 plausible distractors.\n"
            "Distractors must represent common misunderstandings or incorrect interpretations, but must NOT accidentally be true or supported by evidence.\n"
            "Avoid 'All of the above' and 'None of the above'.\n"
            "For True/False: generate meaningful conceptual statements testing understanding, never trivial negations.\n"
            "For Multiple Select: provide options and list of correct answer strings.\n"
            "For Short Answer: provide referenceAnswer, requiredKeyPoints (array of 2-4 strings), and misconceptionIndicators.\n"
            "For Concept Explanation: provide referenceAnswer, requiredKeyPoints, and a rubric array of {points: number, criterion: string}.\n"
            "For Numerical: provide correctAnswer as {expectedValue: number, tolerance: number, units: string}.\n"
            "Reference evidence ONLY via the token IDs like ['EVIDENCE_1'], never emit database IDs or page/slide numbers directly."
        )

        prompt = f"""
{rel_block}

=== COURSE EVIDENCE ===
{evidence_prompt_block}

=== REQUESTED ASSESSMENT SLOTS ===
{slots_block}

Generate exactly {len(planned_slots)} candidate questions.
Respond with a JSON array where each element has:
{{
  "slotIndex": number,
  "questionType": "mcq" | "multiple_select" | "true_false" | "short_answer" | "numerical" | "concept_explanation",
  "questionText": "...",
  "options": ["...", "...", "...", "..."], // for mcq and multiple_select
  "correctAnswer": "..." | boolean | ["..."] | {{"expectedValue": float, "tolerance": float, "units": "..."}},
  "referenceAnswer": "...", // for short_answer and concept_explanation
  "requiredKeyPoints": ["..."], // for short_answer and concept_explanation
  "optionalKeyPoints": ["..."],
  "misconceptionIndicators": ["..."],
  "rubric": [{{"points": 1, "criterion": "..."}}], // for concept_explanation
  "explanation": "...",
  "difficulty": "easy" | "medium" | "hard",
  "evidenceTokens": ["EVIDENCE_1", ...]
}}
"""

        try:
            model_name = getattr(settings, "llm_model", "gemini-2.5-flash")
            response = self.client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            raw_text = response.text
            candidates_data = json.loads(raw_text)
            if not isinstance(candidates_data, list):
                if isinstance(candidates_data, dict) and "questions" in candidates_data:
                    candidates_data = candidates_data["questions"]
                else:
                    candidates_data = [candidates_data]

            results = []
            for item in candidates_data:
                slot_idx = item.get("slotIndex", 1)
                matching_slot = next((s for s in planned_slots if s["slotIndex"] == slot_idx), planned_slots[0])
                c_id = matching_slot["conceptId"]
                c_name = matching_slot["conceptName"]

                # Resolve tokens to trusted database evidence
                cited_tokens = item.get("evidenceTokens") or matching_slot.get("evidenceTokens", [])
                resolved_evidence = []
                vis_id = None
                vis_url = None

                for tok in cited_tokens:
                    ev_rec = token_to_evidence.get(tok)
                    if ev_rec:
                        clean_rec = {
                            "sourceId": ev_rec["sourceId"],
                            "sourceName": ev_rec["sourceName"],
                            "evidenceType": ev_rec["evidenceType"],
                            "locationType": ev_rec.get("locationType"),
                            "sourceChunkId": ev_rec.get("sourceChunkId"),
                            "sourceVisualId": ev_rec.get("sourceVisualId"),
                            "pageNumber": ev_rec.get("pageNumber"),
                            "slideNumber": ev_rec.get("slideNumber"),
                            "startTime": ev_rec.get("startTime"),
                            "endTime": ev_rec.get("endTime"),
                            "visualType": ev_rec.get("visualType"),
                            "imageUrl": ev_rec.get("imageUrl"),
                            "excerpt": ev_rec.get("excerpt", "")[:400],
                        }
                        resolved_evidence.append(clean_rec)
                        if ev_rec.get("sourceVisualId"):
                            vis_id = ev_rec["sourceVisualId"]
                            vis_url = ev_rec.get("imageUrl")

                # If no evidence cited, pull slot's default evidence
                if not resolved_evidence and matching_slot.get("evidenceTokens"):
                    for tok in matching_slot["evidenceTokens"]:
                        ev_rec = token_to_evidence.get(tok)
                        if ev_rec:
                            resolved_evidence.append({
                                "sourceId": ev_rec["sourceId"],
                                "sourceName": ev_rec["sourceName"],
                                "evidenceType": ev_rec["evidenceType"],
                                "locationType": ev_rec.get("locationType"),
                                "sourceChunkId": ev_rec.get("sourceChunkId"),
                                "sourceVisualId": ev_rec.get("sourceVisualId"),
                                "pageNumber": ev_rec.get("pageNumber"),
                                "slideNumber": ev_rec.get("slideNumber"),
                                "startTime": ev_rec.get("startTime"),
                                "endTime": ev_rec.get("endTime"),
                                "visualType": ev_rec.get("visualType"),
                                "imageUrl": ev_rec.get("imageUrl"),
                                "excerpt": ev_rec.get("excerpt", "")[:400],
                            })
                            if ev_rec.get("sourceVisualId"):
                                vis_id = ev_rec["sourceVisualId"]
                                vis_url = ev_rec.get("imageUrl")

                points = 2.0 if item.get("questionType") in ["concept_explanation", "short_answer"] else 1.0

                results.append({
                    "questionType": item.get("questionType", matching_slot["targetType"]),
                    "questionText": item.get("questionText", f"Question regarding {c_name}"),
                    "options": item.get("options"),
                    "correctAnswer": item.get("correctAnswer"),
                    "referenceAnswer": item.get("referenceAnswer"),
                    "requiredKeyPoints": item.get("requiredKeyPoints"),
                    "optionalKeyPoints": item.get("optionalKeyPoints"),
                    "misconceptionIndicators": item.get("misconceptionIndicators"),
                    "rubric": item.get("rubric"),
                    "explanation": item.get("explanation", f"Based on course material on {c_name}."),
                    "difficulty": item.get("difficulty", matching_slot["targetDifficulty"]),
                    "conceptIds": [c_id],
                    "conceptNames": [c_name],
                    "sourceEvidence": resolved_evidence,
                    "sourceVisualId": vis_id,
                    "sourceVisualUrl": vis_url,
                    "points": points,
                })

            return results
        except Exception as e:
            logger.error(f"Gemini Question Generation failed ({e}), using offline grounded generator")
            return self._generate_offline_candidates(planned_slots, token_to_evidence, relationships)

    def _generate_offline_candidates(
        self,
        planned_slots: List[Dict[str, Any]],
        token_to_evidence: Dict[str, Dict[str, Any]],
        relationships: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generates deterministic, fully evidence-grounded candidate questions
        for offline environments or test suites without active API credentials.
        """
        candidates = []
        for slot in planned_slots:
            c_id = slot["conceptId"]
            c_name = slot["conceptName"]
            q_type = slot["targetType"]
            diff = slot["targetDifficulty"]

            # Pull assigned evidence
            ev_tokens = slot.get("evidenceTokens", [])
            evidence_records = [token_to_evidence[tok] for tok in ev_tokens if tok in token_to_evidence]
            primary_ev = evidence_records[0] if evidence_records else {
                "sourceId": "src_default",
                "sourceName": "Course Material",
                "evidenceType": "text",
                "locationType": "document",
                "excerpt": f"Course material covering fundamental concepts of {c_name}."
            }

            excerpt = primary_ev.get("excerpt", "")
            first_sentence = excerpt.split(". ")[0].strip() if excerpt else f"{c_name} is a key concept"
            if not first_sentence.endswith("."):
                first_sentence += "."

            vis_id = primary_ev.get("sourceVisualId")
            vis_url = primary_ev.get("imageUrl")

            # Resolve clean evidence list
            clean_evidence = [{
                "sourceId": primary_ev["sourceId"],
                "sourceName": primary_ev["sourceName"],
                "evidenceType": primary_ev.get("evidenceType", "text"),
                "locationType": primary_ev.get("locationType", "document"),
                "sourceChunkId": primary_ev.get("sourceChunkId"),
                "sourceVisualId": vis_id,
                "pageNumber": primary_ev.get("pageNumber"),
                "slideNumber": primary_ev.get("slideNumber"),
                "startTime": primary_ev.get("startTime"),
                "endTime": primary_ev.get("endTime"),
                "visualType": primary_ev.get("visualType"),
                "imageUrl": vis_url,
                "excerpt": excerpt[:400],
            }]

            if q_type == "mcq":
                correct = first_sentence
                distractor1 = f"It states that {c_name} is only applicable to unrelated external subjects."
                distractor2 = f"It requires completely ignoring any underlying dependencies or variables."
                distractor3 = f"It is an obsolete formulation replaced entirely by empirical trial and error."

                candidates.append({
                    "questionType": "mcq",
                    "questionText": f"According to the course material, which statement accurately describes {c_name}?",
                    "options": [correct, distractor1, distractor2, distractor3],
                    "correctAnswer": correct,
                    "explanation": f"The course material directly states: '{correct}'",
                    "difficulty": diff,
                    "conceptIds": [c_id],
                    "conceptNames": [c_name],
                    "sourceEvidence": clean_evidence,
                    "sourceVisualId": vis_id,
                    "sourceVisualUrl": vis_url,
                    "points": 1.0,
                })

            elif q_type == "true_false":
                candidates.append({
                    "questionType": "true_false",
                    "questionText": f"In this course, {first_sentence}",
                    "options": ["True", "False"],
                    "correctAnswer": True,
                    "explanation": f"This statement is directly verified by the course material: '{first_sentence}'",
                    "difficulty": diff,
                    "conceptIds": [c_id],
                    "conceptNames": [c_name],
                    "sourceEvidence": clean_evidence,
                    "sourceVisualId": vis_id,
                    "sourceVisualUrl": vis_url,
                    "points": 1.0,
                })

            elif q_type == "multiple_select":
                opt_a = f"{c_name} is described as: {first_sentence}"
                opt_b = f"It directly pertains to the study of {c_name}."
                opt_c = f"It applies only when variables are undefined and erratic."
                opt_d = f"It contradicts the foundational principles of {c_name}."

                candidates.append({
                    "questionType": "multiple_select",
                    "questionText": f"Which of the following statements regarding {c_name} are supported by the course material? (Select all that apply)",
                    "options": [opt_a, opt_b, opt_c, opt_d],
                    "correctAnswer": [opt_a, opt_b],
                    "explanation": f"Options A and B are directly substantiated by the course material: '{first_sentence}'",
                    "difficulty": diff,
                    "conceptIds": [c_id],
                    "conceptNames": [c_name],
                    "sourceEvidence": clean_evidence,
                    "sourceVisualId": vis_id,
                    "sourceVisualUrl": vis_url,
                    "points": 1.0,
                })

            elif q_type == "short_answer":
                candidates.append({
                    "questionType": "short_answer",
                    "questionText": f"Explain the core definition and significance of {c_name} based on the course material.",
                    "correctAnswer": first_sentence,
                    "referenceAnswer": first_sentence,
                    "requiredKeyPoints": [
                        f"Accurately defines {c_name}",
                        f"Mentions key principles from the source material: {first_sentence[:80]}"
                    ],
                    "optionalKeyPoints": ["Mentions contextual application in the course"],
                    "misconceptionIndicators": [f"Confusing {c_name} with unrelated external topics"],
                    "explanation": f"Expected answer should reflect: {first_sentence}",
                    "difficulty": diff,
                    "conceptIds": [c_id],
                    "conceptNames": [c_name],
                    "sourceEvidence": clean_evidence,
                    "sourceVisualId": vis_id,
                    "sourceVisualUrl": vis_url,
                    "points": 2.0,
                })

            elif q_type == "concept_explanation":
                candidates.append({
                    "questionType": "concept_explanation",
                    "questionText": f"Detail how {c_name} operates within the context of the course.",
                    "correctAnswer": first_sentence,
                    "referenceAnswer": first_sentence,
                    "requiredKeyPoints": [
                        f"Identifies the primary role of {c_name}",
                        f"Explains the mechanism described in the text: {first_sentence[:80]}"
                    ],
                    "rubric": [
                        {"points": 1.0, "criterion": f"States the definition of {c_name}"},
                        {"points": 1.0, "criterion": f"Explains the mechanism/context: {first_sentence[:80]}"}
                    ],
                    "explanation": f"Grounded in: {first_sentence}",
                    "difficulty": diff,
                    "conceptIds": [c_id],
                    "conceptNames": [c_name],
                    "sourceEvidence": clean_evidence,
                    "sourceVisualId": vis_id,
                    "sourceVisualUrl": vis_url,
                    "points": 2.0,
                })

            elif q_type == "numerical":
                # Find number in excerpt or default
                num_match = re.search(r"[-+]?\d*\.?\d+", excerpt)
                val = float(num_match.group(0)) if num_match else 10.0
                candidates.append({
                    "questionType": "numerical",
                    "questionText": f"Based on the numerical data presented for {c_name}, calculate the expected value.",
                    "correctAnswer": {
                        "expectedValue": val,
                        "tolerance": 0.05,
                        "units": "units"
                    },
                    "explanation": f"From course excerpt: '{excerpt[:100]}', value is {val}.",
                    "difficulty": diff,
                    "conceptIds": [c_id],
                    "conceptNames": [c_name],
                    "sourceEvidence": clean_evidence,
                    "sourceVisualId": vis_id,
                    "sourceVisualUrl": vis_url,
                    "points": 1.0,
                })

        return candidates
