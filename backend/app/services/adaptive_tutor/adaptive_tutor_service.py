"""
Adaptive Tutor Service: Orchestrates query-to-concept mapping, selective learner context,
deterministic pedagogy, grounded RAG retrieval, Gemini generation, and adaptation audit logging.
Enforces:
- RAG evidence path remains grounded and unchanged (Requirement #12)
- Chat interactions NEVER modify persistent mastery (Requirement #37, #48)
- Safe fallback on any service failure (Requirements #61, #63, #64, #65)
- Course & user isolation (Requirement #56)
- Latency optimization (Requirement #66)
"""

import logging
import json
import time
from typing import List, Dict, Any, Optional, Tuple
from google import genai
from google.genai import types

from app.config import settings
from app.services.rag.embedding_service import EmbeddingService
from app.services.rag.llm_service import sanitize_assistant_answer
from app.services.adaptive_tutor.concept_mapper import ConceptMapper
from app.services.adaptive_tutor.prerequisite_service import PrerequisiteService
from app.services.adaptive_tutor.misconception_service import MisconceptionService
from app.services.adaptive_tutor.learner_context_service import LearnerContextService, AdaptiveTutorContext
from app.services.adaptive_tutor.pedagogy_engine import PedagogyEngine, PedagogyStrategy
from app.services.adaptive_tutor.adaptive_prompt_builder import AdaptivePromptBuilder

logger = logging.getLogger(__name__)


class AdaptiveTutorService:
    def __init__(self, convex_client):
        self.convex_client = convex_client
        self.embedding_service = EmbeddingService()
        self.concept_mapper = ConceptMapper(convex_client)
        self.prerequisite_service = PrerequisiteService(convex_client)
        self.misconception_service = MisconceptionService(convex_client)
        self.learner_context_service = LearnerContextService(convex_client)
        self.pedagogy_engine = PedagogyEngine()
        self.prompt_builder = AdaptivePromptBuilder()

        if settings.gemini_api_key:
            self.genai_client = genai.Client(api_key=settings.gemini_api_key)
        else:
            self.genai_client = None

    def ask_adaptive_tutor(
        self,
        course_id: str,
        session_id: str,
        user_id: str,
        question: str,
        tutor_mode: str = "adaptive",
        active_hint_level: Optional[int] = None,
        focus_concept_id: Optional[str] = None,
        review_question_id: Optional[str] = None,
        review_response_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes end-to-end adaptive tutoring.
        """
        start_time = time.time()
        logger.info(
            f"ADAPTIVE_TUTOR_QUERY: courseId={course_id} sessionId={session_id} mode={tutor_mode} question='{question[:60]}...'"
        )

        # 1. Fetch Session History
        formatted_history = []
        try:
            history = self.convex_client.query("tutor:getMessagesBackend", {"sessionId": session_id}) or []
            for msg in history[-5:]:
                formatted_history.append({"role": msg["role"], "content": msg["content"]})
        except Exception as e:
            logger.warning(f"Could not fetch session history: {e}")

        # 2. Resolve Review Context if requested (Review with Tutor)
        review_context = None
        if review_question_id:
            try:
                # Query verified context from convex
                review_args = {"questionId": review_question_id}
                if review_response_id:
                    review_args["responseId"] = review_response_id
                review_context = self.convex_client.query("adaptiveTutor:getReviewAssessmentContext", review_args)
                logger.info(
                    f"ADAPTIVE_TUTOR_REVIEW_CONTEXT_LOADED: questionId={review_question_id} concepts={len(review_context.get('concepts', []))}"
                )
            except Exception as e:
                logger.warning(f"Failed to load review assessment context: {e}")

        # 3. Concept Mapping & Graph Lookup
        course_concepts = []
        relationships = []
        try:
            graph_data = self.convex_client.query("knowledgeGraph:getCourseKnowledgeGraph", {"courseId": course_id})
            if graph_data:
                course_concepts = graph_data.get("concepts", [])
                relationships = graph_data.get("relationships", [])
        except Exception as e:
            logger.warning(f"Graph lookup failed (proceeding without graph): {e}")

        concepts_by_id = {c["_id"]: c for c in course_concepts if "_id" in c}

        review_concepts = review_context.get("concepts") if review_context else None
        target_concepts, concept_match_confidence = self.concept_mapper.map_query_to_concepts(
            query=question,
            course_concepts=course_concepts,
            focus_concept_id=focus_concept_id,
            review_concepts=review_concepts,
        )

        # 4. Selective Learner State Retrieval (Only relevant concepts + direct prereqs)
        learner_concept_states = []
        prerequisite_analysis = {"has_prerequisites": False, "readiness": "not_applicable", "weak_prerequisites": []}
        active_misconceptions = []

        try:
            # Query learner concept states
            all_states = self.convex_client.query("learnerModel:getCourseConceptStates", {"courseId": course_id}) or []
            learner_states_by_id = {s["conceptId"]: s for s in all_states if "conceptId" in s}

            if target_concepts:
                primary_cid = target_concepts[0]["_id"]
                # 4A. Prerequisite analysis
                prerequisite_analysis = self.prerequisite_service.find_prerequisites(
                    target_concept_id=primary_cid,
                    relationships=relationships,
                    concepts_by_id=concepts_by_id,
                    learner_states_by_concept_id=learner_states_by_id,
                )

                # Filter learner states to ONLY target concepts and direct prerequisites (Requirement #4)
                relevant_cids = {c["_id"] for c in target_concepts}
                for wp in prerequisite_analysis.get("weak_prerequisites", []):
                    relevant_cids.add(wp["conceptId"])
                for sp in prerequisite_analysis.get("strong_prerequisites", []):
                    relevant_cids.add(sp["conceptId"])

                learner_concept_states = [s for s in all_states if s.get("conceptId") in relevant_cids]

                # 4B. Misconception lookup
                try:
                    all_misconceptions = self.convex_client.query(
                        "adaptiveTutor:getLearnerMisconceptions",
                        {"courseId": course_id, "activeOnly": True}
                    ) or []
                    active_misconceptions = self.misconception_service.find_active_misconceptions(
                        concept_ids=list(relevant_cids),
                        concept_names=[c.get("name") for c in target_concepts],
                        misconceptions=all_misconceptions,
                    )
                except Exception as me:
                    logger.warning(f"Misconception lookup failed (continuing safely): {me}")

        except Exception as e:
            logger.warning(f"Learner state lookup failed (fallback to neutral): {e}")

        # 5. Build Learner Context
        learner_ctx = self.learner_context_service.build_learner_context(
            course_id=course_id,
            user_id=user_id,
            target_concepts=target_concepts,
            concept_match_confidence=concept_match_confidence,
            learner_concept_states=learner_concept_states,
            prerequisite_analysis=prerequisite_analysis,
            active_misconceptions=active_misconceptions,
            review_context=review_context,
        )

        # 6. Compute Deterministic Pedagogy Strategy
        strategy = self.pedagogy_engine.determine_strategy(
            context=learner_ctx,
            tutor_mode=tutor_mode,
            user_query=question,
            active_hint_level=active_hint_level,
        )

        logger.info(
            f"ADAPTIVE_TUTOR_STRATEGY: concept={learner_ctx.concept_name} mastery={learner_ctx.mastery_band} "
            f"confidence={learner_ctx.confidence} mode={strategy.mode} prereqReview={strategy.include_prerequisite_review}"
        )

        # 7. Grounded RAG Retrieval (Embedding + Vector Search)
        try:
            q_emb = self.embedding_service.embed_text(question)
            retrieved = self.convex_client.action("tutor:search", {
                "courseId": course_id,
                "queryVector": q_emb,
                "limit": settings.rag_top_k,
            }) or []
        except Exception as e:
            logger.error(f"Retrieval error: {e}")
            return {
                "answer": "Error searching course material.",
                "grounded": False,
                "citations": [],
                "retrievalStatus": "failed",
                "adaptation": None,
            }

        if not retrieved:
            logger.info("ADAPTIVE_TUTOR_RETRIEVAL_EMPTY")
            refusal_text = "I couldn't find enough information about this in the materials uploaded for this course."
            adaptation_meta = self._format_adaptation_metadata(learner_ctx, strategy, tutor_mode)
            try:
                self.convex_client.mutation("tutor:addMessageBackend", {
                    "sessionId": session_id,
                    "role": "user",
                    "content": question,
                })
                self.convex_client.mutation("tutor:addMessageBackend", {
                    "sessionId": session_id,
                    "role": "assistant",
                    "content": refusal_text,
                    "grounded": False,
                    "retrievalStatus": "empty",
                    "citations": [],
                    "adaptation": adaptation_meta,
                })
            except Exception as e:
                logger.error(f"Failed to save refusal messages to convex: {e}")
            return {
                "answer": refusal_text,
                "grounded": False,
                "citations": [],
                "retrievalStatus": "empty",
                "adaptation": adaptation_meta,
            }

        top_chunks = retrieved[:settings.rag_final_context_count]

        # 8. Adaptive Prompt Construction
        misconception_guidance = self.misconception_service.format_misconception_guidance(active_misconceptions)
        system_instruction = self.prompt_builder.build_system_instruction(
            strategy=strategy,
            context=learner_ctx,
            review_context=review_context,
        )
        prompt_body = self.prompt_builder.build_prompt_body(
            question=question,
            contexts=top_chunks,
            context=learner_ctx,
            strategy=strategy,
            misconception_guidance=misconception_guidance,
            review_context=review_context,
        )

        # 9. Gemini Generation
        answer_text, is_grounded, citation_ids = self._generate_adaptive_answer(
            system_instruction=system_instruction,
            prompt_body=prompt_body,
            chat_history=formatted_history,
        )

        # 10. Format Citations
        citations = []
        if is_grounded:
            for c_id in citation_ids:
                try:
                    idx = int(c_id.split("_")[1]) - 1
                    if 0 <= idx < len(top_chunks):
                        c = top_chunks[idx]
                        cit = {
                            "sourceId": c["sourceId"],
                            "sourceChunkId": c["_id"],
                            "sourceName": c.get("sourceName", "Unknown"),
                            "locationType": c.get("locationType", "page"),
                            "pageNumber": c.get("pageNumber"),
                            "slideNumber": c.get("slideNumber"),
                            "startTime": c.get("startTime"),
                            "endTime": c.get("endTime"),
                            "evidenceType": c.get("evidenceType", "text"),
                            "visualType": c.get("visualType"),
                            "sourceVisualId": str(c["sourceVisualId"]) if c.get("sourceVisualId") else None,
                            "imageUrl": c.get("imageUrl"),
                            "confidenceNotes": c.get("confidenceNotes"),
                            "sectionTitle": c.get("sectionTitle"),
                            "excerpt": c.get("text", "")[:200] + "...",
                        }
                        citations.append(cit)
                except Exception as ce:
                    logger.debug(f"Citation parse error for {c_id}: {ce}")

        # 11. Format Adaptation Object
        adaptation_meta = self._format_adaptation_metadata(learner_ctx, strategy, tutor_mode)

        # 12. Record Structured Diagnostics / Event
        try:
            self.convex_client.mutation("adaptiveTutor:recordAdaptationEvent", {
                "sessionId": session_id,
                "courseId": course_id,
                "conceptIds": [learner_ctx.concept_id] if learner_ctx.concept_id else [],
                "conceptNames": [learner_ctx.concept_name] if learner_ctx.concept_name else [],
                "masteryBand": learner_ctx.mastery_band,
                "confidence": learner_ctx.confidence,
                "strategy": strategy.mode,
                "tutorMode": tutor_mode,
                "prerequisiteIntervention": bool(strategy.include_prerequisite_review),
                "misconceptionIntervention": bool(len(active_misconceptions) > 0),
                "hintLevel": strategy.hint_level if strategy.mode == "hint" else None,
            })
        except Exception as ee:
            logger.debug(f"Failed to record tutor adaptation event: {ee}")

        # 13. Save messages to Convex
        try:
            self.convex_client.mutation("tutor:addMessageBackend", {
                "sessionId": session_id,
                "role": "user",
                "content": question,
            })
            self.convex_client.mutation("tutor:addMessageBackend", {
                "sessionId": session_id,
                "role": "assistant",
                "content": answer_text,
                "grounded": is_grounded,
                "retrievalStatus": "success",
                "citations": citations,
                "adaptation": adaptation_meta,
            })
        except Exception as me:
            logger.error(f"Failed to save messages to convex: {me}")

        elapsed = time.time() - start_time
        logger.info(
            f"ADAPTIVE_TUTOR_COMPLETE: elapsed={elapsed:.2f}s grounded={is_grounded} citations={len(citations)}"
        )

        return {
            "answer": answer_text,
            "grounded": is_grounded,
            "citations": citations,
            "retrievalStatus": "success",
            "adaptation": adaptation_meta,
        }

    def _generate_adaptive_answer(
        self,
        system_instruction: str,
        prompt_body: str,
        chat_history: List[Dict[str, str]],
    ) -> Tuple[str, bool, List[str]]:
        """
        Calls Gemini with structured system instruction and JSON schema enforcement.
        """
        if not self.genai_client:
            raise ValueError("GenAI client is not configured (missing GEMINI_API_KEY).")

        contents = []
        if chat_history:
            for msg in chat_history:
                contents.append(
                    types.Content(
                        role=msg["role"],
                        parts=[types.Part.from_text(text=msg["content"])],
                    )
                )

        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=prompt_body)],
            )
        )

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            temperature=0.2,
        )

        try:
            response = self.genai_client.models.generate_content(
                model=settings.gemini_model,
                contents=contents,
                config=config,
            )

            res_text = response.text
            data = json.loads(res_text)
            raw_answer = data.get("answer", "")
            citations = data.get("citations", [])
            grounded = data.get("grounded", False)
            sanitized_answer = sanitize_assistant_answer(raw_answer)

            return sanitized_answer, grounded, citations

        except Exception as e:
            logger.error(f"Gemini Adaptive Generation Error: {e}")
            # Fallback text response
            return "I encountered an error generating an answer based on the course materials.", False, []

    def _format_adaptation_metadata(
        self,
        context: AdaptiveTutorContext,
        strategy: PedagogyStrategy,
        tutor_mode: str,
    ) -> Dict[str, Any]:
        """
        Formats the client-safe adaptation object (never exposes raw prompts or private internals).
        """
        return {
            "conceptId": context.concept_id,
            "conceptName": context.concept_name,
            "masteryBand": context.mastery_band,
            "masteryPercentage": context.mastery_percentage,
            "confidence": context.confidence,
            "tutorMode": tutor_mode,
            "pedagogyStrategy": strategy.mode,
            "prerequisiteIntervention": strategy.include_prerequisite_review,
            "weakPrerequisiteName": strategy.weak_prerequisite_name,
            "misconceptionAddressed": (
                context.active_misconceptions[0]["description"]
                if context.active_misconceptions
                else None
            ),
            "hintLevel": strategy.hint_level if strategy.mode == "hint" else None,
            "whyThisApproach": strategy.why_this_approach,
            "followUpSuggestions": strategy.follow_up_suggestions,
        }
