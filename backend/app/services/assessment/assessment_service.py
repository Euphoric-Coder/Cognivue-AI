import logging
import requests
from typing import List, Dict, Any, Optional
from convex import ConvexClient
from app.config import settings
from app.services.assessment.evidence_selector import EvidenceSelector
from app.services.assessment.difficulty_classifier import DifficultyClassifier
from app.services.assessment.duplicate_detector import DuplicateDetector
from app.services.assessment.question_generator import QuestionGenerator
from app.services.assessment.question_validator import QuestionValidator
from app.services.assessment.assessment_planner import AssessmentPlanner
from app.services.assessment.grading_service import GradingService

logger = logging.getLogger(__name__)

class AssessmentService:
    """
    Main orchestration service for Grounded Assessment Engine V7:
    Plans, gathers evidence, generates candidates, verifies grounding & distractors,
    eliminates duplicates, manages replacement generation, and persists to Convex.
    """

    def __init__(self):
        self.convex_client = ConvexClient(settings.convex_url)
        self.evidence_selector = EvidenceSelector()
        self.planner = AssessmentPlanner()
        self.question_generator = QuestionGenerator()
        self.question_validator = QuestionValidator()
        self.duplicate_detector = DuplicateDetector()
        self.difficulty_classifier = DifficultyClassifier()
        self.grading_service = GradingService()

    def update_assessment_status(self, assessment_id: str, status: str, error: Optional[str] = None):
        """Updates assessment status in Convex via HTTP or ConvexClient."""
        url = f"{settings.convex_site_url}/assessment/status"
        headers = {"x-ingestion-secret": settings.ingestion_api_secret}
        payload = {"assessmentId": assessment_id, "status": status}
        if error:
            payload["error"] = error

        try:
            res = requests.post(url, json=payload, headers=headers)
            res.raise_for_status()
        except Exception as e:
            logger.warning(f"HTTP assessment status update failed ({e}), falling back to direct mutation")
            try:
                self.convex_client.mutation("assessments:updateAssessmentStatus", payload)
            except Exception as e2:
                logger.error(f"Failed to update assessment status: {e2}")

    def generate_assessment(
        self,
        assessment_id: str,
        course_id: str,
        user_id: Optional[str] = None,
        title: Optional[str] = None,
        assessment_type: str = "topic_quiz",
        selected_concept_ids: Optional[List[str]] = None,
        difficulty: str = "mixed",
        question_count: int = 10,
        question_types: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Executes the full assessment generation pipeline.
        """
        logger.info(
            f"ASSESSMENT_CREATE_START: assessmentId={assessment_id}, courseId={course_id}, "
            f"type={assessment_type}, count={question_count}, diff={difficulty}"
        )
        self.update_assessment_status(assessment_id, "generating")

        try:
            # 1. Fetch planning data from Convex
            data = self.convex_client.query(
                "assessments:getBackendAssessmentPlanningData",
                {"courseId": course_id, "assessmentId": assessment_id}
            )
            if not data or not data.get("course"):
                raise ValueError(f"Course {course_id} not found or inaccessible.")

            course = data["course"]
            concepts = data.get("concepts", [])
            relationships = data.get("relationships", [])
            evidence_records = data.get("evidence", [])
            visuals = data.get("visuals", [])
            chunks = data.get("chunks", [])

            if not concepts:
                raise ValueError("No concepts found in course knowledge graph. Please build the knowledge graph first.")

            # 2. Organize and index evidence
            evidence_ctx = self.evidence_selector.prepare_evidence_context(
                concepts=concepts,
                evidence_list=evidence_records,
                chunks=chunks,
                visuals=visuals,
                selected_concept_ids=selected_concept_ids
            )
            active_concepts = evidence_ctx["activeConcepts"]
            concept_evidence_map = evidence_ctx["conceptEvidenceMap"]
            token_to_evidence = evidence_ctx["tokenToEvidence"]
            all_evidence = evidence_ctx["allEvidence"]

            # 3. Plan assessment distribution
            plan = self.planner.plan_assessment(
                active_concepts=active_concepts,
                concept_evidence_map=concept_evidence_map,
                requested_count=question_count,
                requested_difficulty=difficulty,
                requested_types=question_types,
                assessment_type=assessment_type,
                relationships=relationships,
            )

            planned_slots = plan.get("plannedQuestions", [])
            if not planned_slots:
                err_msg = plan.get("insufficientEvidenceMessage") or "Insufficient course evidence to generate questions."
                self.update_assessment_status(assessment_id, "failed", error=err_msg)
                return {"status": "failed", "error": err_msg}

            # 4. Generate candidate questions with replacement loop (Requirement 32)
            evidence_prompt_block = self.evidence_selector.format_evidence_for_prompt(all_evidence[:25])

            accepted_questions: List[Dict[str, Any]] = []
            total_candidates_generated = 0
            rejected_grounding = 0
            rejected_duplicates = 0
            rejected_distractors = 0
            rejected_difficulty = 0

            target_needed = len(planned_slots)
            slots_to_generate = list(planned_slots)
            max_attempts = 3
            current_attempt = 0

            while slots_to_generate and current_attempt < max_attempts:
                current_attempt += 1
                logger.info(
                    f"QUESTION_GENERATION_START: attempt {current_attempt}/{max_attempts}, "
                    f"needed {len(slots_to_generate)} questions"
                )

                candidates = self.question_generator.generate_candidate_questions(
                    planned_slots=slots_to_generate,
                    evidence_prompt_block=evidence_prompt_block,
                    token_to_evidence=token_to_evidence,
                    relationships=relationships
                )
                total_candidates_generated += len(candidates)

                slots_to_generate = []

                for cand in candidates:
                    logger.info(f"QUESTION_GENERATED: type={cand.get('questionType')}, concept={cand.get('conceptNames')}")

                    # A. Duplicate check (Requirement 30)
                    if self.duplicate_detector.is_duplicate(cand, accepted_questions):
                        logger.warning(f"QUESTION_DUPLICATE_REJECTED: '{cand.get('questionText')[:60]}...'")
                        rejected_duplicates += 1
                        continue

                    # B. Second-pass validation (Requirement 27-29)
                    is_valid, reason, quality_score = self.question_validator.validate(
                        question=cand,
                        evidence_items=cand.get("sourceEvidence", []),
                        target_difficulty=cand.get("difficulty", difficulty)
                    )

                    if not is_valid:
                        logger.warning(f"QUESTION_REJECTED: {reason}")
                        if "Distractor" in reason:
                            rejected_distractors += 1
                        elif "Difficulty" in reason:
                            rejected_difficulty += 1
                        else:
                            rejected_grounding += 1
                        continue

                    # Accepted!
                    cand["qualityScore"] = quality_score
                    cand["questionIndex"] = len(accepted_questions) + 1
                    accepted_questions.append(cand)
                    logger.info(f"QUESTION_VALIDATION_PASS: index={cand['questionIndex']}, quality={quality_score}")

                    if len(accepted_questions) >= target_needed:
                        break

                # If still under target and have attempts left, schedule replacements
                deficit = target_needed - len(accepted_questions)
                if deficit > 0 and current_attempt < max_attempts:
                    logger.info(f"Scheduling {deficit} replacement question(s) for next pass.")
                    # Pick remaining slots
                    for d_idx in range(deficit):
                        base_slot = planned_slots[(len(accepted_questions) + d_idx) % len(planned_slots)]
                        slots_to_generate.append({
                            **base_slot,
                            "slotIndex": len(accepted_questions) + d_idx + 1,
                        })

            total_accepted = len(accepted_questions)
            total_rejected = (
                rejected_grounding + rejected_duplicates + rejected_distractors + rejected_difficulty
            )

            logger.info(
                f"ASSESSMENT_GENERATION_COMPLETE: requested={question_count}, candidates={total_candidates_generated}, "
                f"accepted={total_accepted}, rejected={total_rejected} "
                f"(grounding={rejected_grounding}, duplicates={rejected_duplicates}, "
                f"distractors={rejected_distractors}, difficulty={rejected_difficulty})"
            )

            if total_accepted == 0:
                err_msg = "Could not validate any candidate questions against uploaded course material."
                self.update_assessment_status(assessment_id, "failed", error=err_msg)
                return {"status": "failed", "error": err_msg}

            # 5. Persist to Convex (HTTP save or mutation)
            final_status = "ready"

            clean_questions = []
            for q in accepted_questions:
                clean_q = {}
                for k, v in q.items():
                    if v is not None:
                        if k == "sourceEvidence" and isinstance(v, list):
                            clean_ev_list = []
                            for ev in v:
                                clean_ev = {ek: ev[ek] for ek in ev if ev[ek] is not None}
                                clean_ev_list.append(clean_ev)
                            clean_q[k] = clean_ev_list
                        else:
                            clean_q[k] = v
                clean_questions.append(clean_q)

            persist_payload = {
                "assessmentId": assessment_id,
                "status": final_status,
                "generationVersion": 1,
                "questions": clean_questions,
            }

            save_url = f"{settings.convex_site_url}/assessment/save"
            save_headers = {"x-ingestion-secret": settings.ingestion_api_secret}

            try:
                res = requests.post(save_url, json=persist_payload, headers=save_headers)
                res.raise_for_status()
            except Exception as e:
                logger.warning(f"HTTP assessment save failed ({e}), using direct ConvexClient mutation")
                self.convex_client.mutation("assessments:saveGeneratedAssessmentBackend", persist_payload)

            return {
                "status": final_status,
                "questionsRequested": question_count,
                "candidatesGenerated": total_candidates_generated,
                "questionsAccepted": total_accepted,
                "questionsRejected": total_rejected,
                "rejections": {
                    "grounding": rejected_grounding,
                    "duplicates": rejected_duplicates,
                    "distractors": rejected_distractors,
                    "difficulty": rejected_difficulty,
                },
                "insufficientEvidenceMessage": plan.get("insufficientEvidenceMessage"),
            }

        except Exception as e:
            logger.error(f"ASSESSMENT_GENERATE_FAILED: {e}", exc_info=True)
            self.update_assessment_status(assessment_id, "failed", error=str(e))
            return {"status": "failed", "error": str(e)}

    def regenerate_single_question(
        self,
        assessment_id: str,
        question_id: str,
        course_id: str,
        concept_id: Optional[str] = None,
        difficulty: Optional[str] = None,
        question_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Regenerates a single question in draft assessment preserving concept and difficulty (Requirement 41).
        """
        # Fetch planning data
        data = self.convex_client.query(
            "assessments:getBackendAssessmentPlanningData",
            {"courseId": course_id, "assessmentId": assessment_id}
        )
        if not data or not data.get("course"):
            raise ValueError(f"Course {course_id} not found.")

        concepts = data.get("concepts", [])
        evidence_records = data.get("evidence", [])
        chunks = data.get("chunks", [])
        visuals = data.get("visuals", [])

        # Fetch existing questions to avoid duplicates
        existing_questions = self.convex_client.query(
            "assessments:getAssessmentQuestions",
            {"assessmentId": assessment_id}
        )
        remaining = [q for q in existing_questions if str(q["_id"]) != question_id]

        target_concept = next((c for c in concepts if str(c["_id"]) == concept_id), concepts[0] if concepts else None)
        if not target_concept:
            raise ValueError("No matching concept found.")

        evidence_ctx = self.evidence_selector.prepare_evidence_context(
            concepts=[target_concept],
            evidence_list=evidence_records,
            chunks=chunks,
            visuals=visuals,
            selected_concept_ids=[str(target_concept["_id"])]
        )

        token_to_evidence = evidence_ctx["tokenToEvidence"]
        all_ev = evidence_ctx["allEvidence"]
        ev_prompt_block = self.evidence_selector.format_evidence_for_prompt(all_ev[:10])

        target_slot = {
            "slotIndex": 1,
            "conceptId": str(target_concept["_id"]),
            "conceptName": target_concept["name"],
            "targetDifficulty": difficulty or "medium",
            "targetType": question_type or "mcq",
            "evidenceTokens": [e["token"] for e in all_ev[:3]],
        }

        # Generate replacement candidate
        candidates = self.question_generator.generate_candidate_questions(
            planned_slots=[target_slot],
            evidence_prompt_block=ev_prompt_block,
            token_to_evidence=token_to_evidence
        )

        for cand in candidates:
            if not self.duplicate_detector.is_duplicate(cand, remaining):
                is_valid, reason, quality_score = self.question_validator.validate(
                    question=cand,
                    evidence_items=cand.get("sourceEvidence", []),
                    target_difficulty=cand.get("difficulty", "medium")
                )
                if is_valid:
                    cand["qualityScore"] = quality_score
                    # Patch question in Convex
                    patch_args = {
                        "questionId": question_id,
                        "questionText": cand["questionText"],
                        "correctAnswer": cand["correctAnswer"],
                        "explanation": cand["explanation"],
                        "difficulty": cand["difficulty"],
                        "points": cand["points"],
                        "qualityScore": quality_score,
                    }
                    if cand.get("options") is not None:
                        patch_args["options"] = cand["options"]
                    if cand.get("referenceAnswer") is not None:
                        patch_args["referenceAnswer"] = cand["referenceAnswer"]
                    if cand.get("requiredKeyPoints") is not None:
                        patch_args["requiredKeyPoints"] = cand["requiredKeyPoints"]
                    if cand.get("optionalKeyPoints") is not None:
                        patch_args["optionalKeyPoints"] = cand["optionalKeyPoints"]
                    if cand.get("misconceptionIndicators") is not None:
                        patch_args["misconceptionIndicators"] = cand["misconceptionIndicators"]
                    if cand.get("rubric") is not None:
                        patch_args["rubric"] = cand["rubric"]

                    self.convex_client.mutation("assessments:updateQuestionBackend", patch_args)
                    return {"success": True, "question": cand}

        return {"success": False, "error": "Could not generate a unique grounded replacement question."}
