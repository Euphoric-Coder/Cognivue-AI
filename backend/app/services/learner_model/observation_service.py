"""
Observation Service: Validates graded responses and generates deterministic learner observations.
"""

import logging
from typing import List, Dict, Any, Optional
from app.services.learner_model.config import (
    MODEL_VERSION,
    DIFFICULTY_WEIGHTS,
    QUESTION_TYPE_WEIGHTS
)

logger = logging.getLogger(__name__)


class ObservationService:
    """
    Transforms graded assessment responses into granular, auditable learner observations.
    """

    def create_observations_for_question(
        self,
        user_id: str,
        course_id: str,
        assessment_id: str,
        attempt_id: str,
        question: Dict[str, Any],
        response: Dict[str, Any],
        concepts_by_id: Dict[str, Any],
        timestamp: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Creates one observation per relevant concept associated with a question.
        Ensures partial credit preservation, difficulty weighting, and multi-concept partitioning.
        """
        import time
        now_ts = timestamp or int(time.time() * 1000)

        points = question.get("points", 1)
        awarded_points = response.get("awardedPoints", 0.0)
        is_answered = response.get("isAnswered", False)

        # 1. Calculate continuous score fraction (0.0 to 1.0)
        score_fraction = max(0.0, min(1.0, awarded_points / points)) if points > 0 else 0.0

        # 2. Categorize correctness
        if not is_answered:
            correctness = "unanswered"
        elif score_fraction >= 0.99:
            correctness = "correct"
        elif score_fraction > 0.0:
            correctness = "partial"
        else:
            correctness = "incorrect"

        question_type = question.get("questionType", "mcq")
        difficulty = question.get("difficulty", "medium")
        diff_weight = DIFFICULTY_WEIGHTS.get(difficulty, 1.0)
        type_weight = QUESTION_TYPE_WEIGHTS.get(question_type, 1.0)

        concept_ids = question.get("conceptIds", [])
        if not concept_ids:
            return []

        # Multi-concept equal weight partition
        multi_concept_weight = 1.0 / len(concept_ids)
        total_obs_weight = round(diff_weight * type_weight * multi_concept_weight, 3)

        observations = []
        for c_id in concept_ids:
            concept = concepts_by_id.get(c_id)
            if not concept:
                continue

            c_name = concept.get("name", "Concept")
            c_key = concept.get("normalizedName") or c_name.lower().strip()

            obs = {
                "userId": user_id,
                "courseId": course_id,
                "conceptId": c_id,
                "conceptKey": c_key,
                "conceptName": c_name,
                "assessmentId": assessment_id,
                "attemptId": attempt_id,
                "questionId": question.get("_id") or question.get("id"),
                "responseId": response.get("_id") or response.get("id"),
                "questionType": question_type,
                "difficulty": difficulty,
                "scoreFraction": round(score_fraction, 4),
                "correctness": correctness,
                "weight": total_obs_weight,
                "timestamp": now_ts,
                "modelVersion": MODEL_VERSION,
            }

            logger.info(
                f"[LEARNER_OBSERVATION_CREATED] concept=\"{c_name}\" "
                f"scoreFraction={score_fraction:.2f} correctness={correctness} "
                f"difficulty={difficulty} type={question_type}"
            )
            observations.append(obs)

        return observations
