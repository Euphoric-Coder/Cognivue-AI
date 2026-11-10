"""
Study Intelligence Service for Cognivue AI Version 10.
Top-level orchestration service for Personal Study Intelligence.
Coordinates recommendation generation, plan building, spaced review scheduling,
and Convex persistence while enforcing user and course isolation.
"""

from typing import List, Dict, Any, Optional
import time
import logging
from convex import ConvexClient

from app.config import settings
from app.services.study_intelligence.recommendation_engine import RecommendationEngine
from app.services.study_intelligence.study_plan_builder import StudyPlanBuilder
from app.services.study_intelligence.exam_plan_builder import ExamPlanBuilder
from app.services.study_intelligence.spaced_review_engine import SpacedReviewEngine

logger = logging.getLogger(__name__)


class StudyIntelligenceService:
    """
    Core service coordinating Personal Study Intelligence.
    """

    def __init__(self, convex_client: Optional[ConvexClient] = None):
        if convex_client is not None:
            self.convex_client = convex_client
        else:
            try:
                self.convex_client = ConvexClient(settings.convex_url)
            except Exception as e:
                logger.warning(f"Convex client initialization deferred/failed: {e}")
                self.convex_client = None

        self.recommendation_engine = RecommendationEngine()
        self.study_plan_builder = StudyPlanBuilder()
        self.exam_plan_builder = ExamPlanBuilder()
        self.spaced_review_engine = SpacedReviewEngine()

    def recompute_study_recommendations(
        self,
        course_id: str,
        user_id: Optional[str] = None,
        exam_target_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Gathers learner and course data and recalculates study recommendations idempotently.
        """
        logger.info(f"STUDY_RECOMMENDATION_RECOMPUTE: courseId={course_id} userId={user_id}")
        now_ms = int(time.time() * 1000)

        # 1. Fetch course graph concepts & relationships
        concepts = []
        relationships = []
        try:
            graph_data = self.convex_client.query("knowledgeGraph:getCourseKnowledgeGraph", {"courseId": course_id})
            if graph_data:
                concepts = graph_data.get("concepts", [])
                relationships = graph_data.get("relationships", [])
        except Exception as e:
            logger.warning(f"Failed to fetch course knowledge graph: {e}")

        if not concepts:
            return {"count": 0, "recommendations": []}

        # 2. Fetch learner states
        learner_states = []
        try:
            learner_states = self.convex_client.query("learnerModel:getCourseConceptStates", {"courseId": course_id}) or []
        except Exception as e:
            logger.warning(f"Failed to fetch learner concept states: {e}")

        # 3. Fetch active misconceptions
        active_misconceptions = []
        try:
            active_misconceptions = self.convex_client.query(
                "adaptiveTutor:getLearnerMisconceptions",
                {"courseId": course_id, "activeOnly": True}
            ) or []
        except Exception as e:
            logger.warning(f"Failed to fetch active misconceptions: {e}")

        # 4. Fetch review states
        review_states = []
        try:
            review_states = self.convex_client.query("studyIntelligence:getDueReviews", {"courseId": course_id}) or []
        except Exception as e:
            logger.warning(f"Failed to fetch review states: {e}")

        # 5. Fetch sources & visuals
        sources = []
        visuals = []
        try:
            sources = self.convex_client.query("sources:getCourseSources", {"courseId": course_id}) or []
        except Exception as e:
            logger.warning(f"Failed to fetch sources: {e}")

        # 6. Generate recommendations
        recommendations = self.recommendation_engine.generate_recommendations(
            course_id=course_id,
            user_id=user_id or "default_user",
            concepts=concepts,
            learner_states=learner_states,
            relationships=relationships,
            active_misconceptions=active_misconceptions,
            review_states=review_states,
            sources=sources,
            visuals=visuals,
            exam_target_date=exam_target_date,
            now_ms=now_ms,
        )

        # 7. Persist to Convex if user_id is provided
        if user_id and self.convex_client:
            try:
                self.convex_client.mutation(
                    "studyIntelligence:saveStudyRecommendationsBackend",
                    {
                        "courseId": course_id,
                        "userId": user_id,
                        "recommendations": recommendations,
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to persist recommendations to Convex: {e}")

        critical_count = sum(1 for r in recommendations if r.get("priorityBand") == "critical")
        high_count = sum(1 for r in recommendations if r.get("priorityBand") == "high")
        medium_count = sum(1 for r in recommendations if r.get("priorityBand") == "medium")
        low_count = sum(1 for r in recommendations if r.get("priorityBand") == "low")

        logger.info(
            f"STUDY_PRIORITY_UPDATED: courseId={course_id} count={len(recommendations)} "
            f"critical={critical_count} high={high_count} medium={medium_count} low={low_count}"
        )

        return {
            "count": len(recommendations),
            "criticalCount": critical_count,
            "highCount": high_count,
            "mediumCount": medium_count,
            "lowCount": low_count,
            "recommendations": recommendations,
        }

    def generate_study_plan(
        self,
        course_id: str,
        user_id: str,
        plan_type: str = "daily", # "daily" | "weekly" | "exam_preparation"
        daily_minutes: int = 30,
        preferred_days: Optional[List[str]] = None,
        target_date: Optional[str] = None,
        today_date_str: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generates and saves a structured study plan based on current recommendations.
        """
        # Ensure fresh recommendations
        recs_res = self.recompute_study_recommendations(
            course_id=course_id,
            user_id=user_id,
            exam_target_date=target_date,
        )
        recommendations = recs_res.get("recommendations", [])

        if plan_type == "daily":
            plan = self.study_plan_builder.build_daily_plan(
                recommendations=recommendations,
                daily_minutes=daily_minutes,
                today_date_str=today_date_str,
            )
        elif plan_type == "weekly":
            plan = self.study_plan_builder.build_weekly_plan(
                recommendations=recommendations,
                daily_minutes=daily_minutes,
                preferred_days=preferred_days,
                start_date_str=today_date_str,
            )
        elif plan_type == "exam_preparation":
            if not target_date:
                raise ValueError("Exam preparation plan requires target_date")
            plan = self.exam_plan_builder.build_exam_plan(
                recommendations=recommendations,
                target_date_str=target_date,
                daily_minutes=daily_minutes,
                preferred_days=preferred_days,
                start_date_str=today_date_str,
            )
        else:
            plan = self.study_plan_builder.build_daily_plan(
                recommendations=recommendations,
                daily_minutes=daily_minutes,
                today_date_str=today_date_str,
            )

        items = plan.pop("items", [])

        # Persist to Convex
        if self.convex_client and user_id:
            try:
                persist_res = self.convex_client.mutation(
                    "studyIntelligence:saveStudyPlanBackend",
                    {
                        "courseId": course_id,
                        "userId": user_id,
                        "plan": plan,
                        "items": items,
                    }
                )
                plan["planId"] = persist_res.get("planId")
            except Exception as e:
                logger.warning(f"Failed to persist study plan to Convex: {e}")

        plan["items"] = items
        logger.info(f"STUDY_PLAN_GENERATED: courseId={course_id} planType={plan_type} itemsCount={len(items)}")
        return plan

    def complete_study_item(
        self,
        item_id: str,
        user_id: str,
        duration_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Completes a study item and logs a studyActivityEvent without modifying persistent mastery (Section 37 & 38).
        """
        logger.info(f"STUDY_ITEM_COMPLETED: itemId={item_id} userId={user_id}")
        if self.convex_client:
            return self.convex_client.mutation(
                "studyIntelligence:completeStudyPlanItem",
                {
                    "itemId": item_id,
                    "durationSeconds": duration_seconds,
                }
            )
        return {"success": True, "itemId": item_id}

    def record_review_event(
        self,
        course_id: str,
        user_id: str,
        concept_id: str,
        outcome: str,
    ) -> Dict[str, Any]:
        """
        Records a spaced review outcome (success or fail) and schedules the next review date.
        """
        logger.info(f"SPACED_REVIEW_SCHEDULED: courseId={course_id} conceptId={concept_id} outcome={outcome}")
        if self.convex_client:
            return self.convex_client.mutation(
                "studyIntelligence:recordReviewEvent",
                {
                    "courseId": course_id,
                    "conceptId": concept_id,
                    "outcome": outcome,
                }
            )
        return {"success": True, "conceptId": concept_id, "outcome": outcome}

    def get_tutor_study_context(
        self,
        course_id: str,
        user_id: str,
        query_type: str = "general",
    ) -> Dict[str, Any]:
        """
        Retrieves factual study recommendations and plans for the Adaptive Tutor (Section 49 & 50).
        Ensures Gemini explains real learner data rather than hallucinating study advice.
        """
        recs_res = self.recompute_study_recommendations(course_id=course_id, user_id=user_id)
        recommendations = recs_res.get("recommendations", [])

        # Fetch active study plan if any
        active_plan = None
        if self.convex_client:
            try:
                active_plan = self.convex_client.query(
                    "studyIntelligence:getActiveStudyPlan",
                    {"courseId": course_id}
                )
            except Exception:
                pass

        weak_concepts = [
            r for r in recommendations
            if r.get("priorityBand") in ("critical", "high") and "NOT_ASSESSED" not in r.get("reasonCodes", [])
        ]
        due_reviews = [
            r for r in recommendations
            if "DUE_FOR_REVIEW" in r.get("reasonCodes", [])
        ]
        prereq_blockers = [
            r for r in recommendations
            if "PREREQUISITE_BLOCKER" in r.get("reasonCodes", [])
        ]
        unassessed = [
            r for r in recommendations
            if "NOT_ASSESSED" in r.get("reasonCodes", [])
        ]

        return {
            "topRecommendations": recommendations[:5],
            "weakConcepts": weak_concepts[:3],
            "dueReviews": due_reviews[:3],
            "prerequisiteBlockers": prereq_blockers[:3],
            "unassessedCore": [u for u in unassessed if "CORE_CONCEPT" in u.get("reasonCodes", [])][:3],
            "activePlan": active_plan,
        }

