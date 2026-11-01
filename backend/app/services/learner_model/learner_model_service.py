"""
Learner Model Service: Orchestration service for V8 Learner Model & Knowledge Tracing.
Coordinates observation generation, mastery evaluation, confidence calculation, and Convex persistence.
"""

import logging
from typing import List, Dict, Any, Optional
from convex import ConvexClient
from app.config import settings
from app.services.learner_model.config import (
    MODEL_VERSION,
    IMPORTANCE_WEIGHTS,
    MIN_EVIDENCE_FOR_ESTIMATE
)
from app.services.learner_model.observation_service import ObservationService
from app.services.learner_model.mastery_engine import MasteryEngine
from app.services.learner_model.confidence_engine import ConfidenceEngine
from app.services.learner_model.trend_analyzer import TrendAnalyzer
from app.services.learner_model.prerequisite_readiness import PrerequisiteReadinessEvaluator

logger = logging.getLogger(__name__)


class LearnerModelService:
    """
    Core service coordinating the deterministic knowledge-tracing pipeline.
    """

    def __init__(self):
        self.convex_client = ConvexClient(settings.convex_url)
        self.observation_service = ObservationService()
        self.mastery_engine = MasteryEngine()
        self.confidence_engine = ConfidenceEngine()
        self.trend_analyzer = TrendAnalyzer()
        self.readiness_evaluator = PrerequisiteReadinessEvaluator()

    def recompute_course_learner_model(self, course_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Triggers course-level recomputation and backfill in Convex.
        """
        logger.info(f"[LEARNER_MODEL_RECOMPUTE] courseId={course_id} userId={user_id}")
        logger.info(f"[LEARNER_MODEL_BACKFILL_START] courseId={course_id}")

        result = self.convex_client.mutation(
            "learnerModel:recomputeCourseLearnerModel",
            {"courseId": course_id}
        )

        logger.info(f"[LEARNER_MODEL_BACKFILL_COMPLETE] courseId={course_id} attemptsProcessed={result.get('attemptsProcessed', 0)}")
        return result

    def get_course_learner_summary(self, course_id: str) -> Dict[str, Any]:
        """
        Queries Convex for the user's course-level learning progress.
        """
        return self.convex_client.query(
            "learnerModel:getCourseLearnerSummary",
            {"courseId": course_id}
        )

    def get_concept_learner_details(self, course_id: str, concept_id: str) -> Dict[str, Any]:
        """
        Queries Convex for concept-level mastery, confidence, evidence history, and explainability.
        """
        return self.convex_client.query(
            "learnerModel:getConceptLearnerDetails",
            {"courseId": course_id, "conceptId": concept_id}
        )

    def get_diagnostics(self, course_id: str, concept_id: str) -> Dict[str, Any]:
        """
        Development-only diagnostics revealing raw observation weights, decay factors, and formula components.
        """
        data = self.convex_client.query(
            "learnerModel:getConceptLearnerDetails",
            {"courseId": course_id, "conceptId": concept_id}
        )
        if not data:
            return {"error": "Concept learner state not found"}

        observations = data.get("observations", [])
        mastery_calc = self.mastery_engine.compute_mastery(observations, int(data.get("updatedAt", 0) or 0))

        return {
            "conceptName": data.get("conceptName"),
            "conceptId": concept_id,
            "masteryProbability": data.get("masteryProbability"),
            "confidence": data.get("confidence"),
            "confidenceScore": data.get("confidenceScore"),
            "evidenceCount": data.get("evidenceCount"),
            "masteryBand": data.get("masteryBand"),
            "formulaDiagnostics": mastery_calc.get("diagnostics", []),
            "tally": mastery_calc.get("tally", {}),
            "difficultyExposure": data.get("difficultyExposure", {}),
            "whyThisScore": data.get("whyThisScore"),
        }
