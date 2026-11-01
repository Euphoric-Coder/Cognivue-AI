"""
Mastery Engine: Transparent, inspectable evidence-based knowledge tracing algorithm.
Computes concept mastery probability, recent performance, and explainability factors.
"""

import math
import logging
from typing import List, Dict, Any, Tuple
from app.services.learner_model.config import (
    DIFFICULTY_WEIGHTS,
    QUESTION_TYPE_WEIGHTS,
    RECENCY_HALF_LIFE_DAYS,
    RECENCY_MIN_FACTOR,
    MIN_EVIDENCE_FOR_ESTIMATE
)

logger = logging.getLogger(__name__)


class MasteryEngine:
    """
    Computes deterministic, difficulty-weighted, and recency-attenuated concept mastery.
    """

    def calculate_recency_weight(self, obs_timestamp: int, reference_timestamp: int) -> float:
        """
        Calculates a smooth decay factor: w = max(min_factor, 0.5 ** (days / half_life))
        Older evidence retains a stable base weight so historical mastery is not abruptly erased.
        """
        age_ms = max(0, reference_timestamp - obs_timestamp)
        days_ago = age_ms / (1000.0 * 60.0 * 60.0 * 24.0)
        decay = math.pow(0.5, days_ago / RECENCY_HALF_LIFE_DAYS)
        return max(RECENCY_MIN_FACTOR, decay)

    def compute_mastery(
        self,
        observations: List[Dict[str, Any]],
        reference_timestamp: int
    ) -> Dict[str, Any]:
        """
        Computes mastery probability from observations.
        Returns:
            mastery_probability: float (0.0 to 1.0)
            weighted_score: float
            recent_score: float
            difficulty_exposure: Dict[str, int]
            tally: Dict[str, int]
            diagnostics: List[Dict[str, Any]]
        """
        if not observations:
            return {
                "mastery_probability": 0.0,
                "weighted_score": 0.0,
                "recent_score": 0.0,
                "difficulty_exposure": {"easy": 0, "medium": 0, "hard": 0},
                "tally": {
                    "total": 0,
                    "correct": 0,
                    "partial": 0,
                    "incorrect": 0,
                    "unanswered": 0,
                },
                "diagnostics": [],
            }

        sorted_obs = sorted(observations, key=lambda x: x.get("timestamp", 0))

        total_weight = 0.0
        weighted_sum = 0.0
        diff_exposure = {"easy": 0, "medium": 0, "hard": 0}
        tally = {"total": len(sorted_obs), "correct": 0, "partial": 0, "incorrect": 0, "unanswered": 0}
        diagnostics = []

        for obs in sorted_obs:
            score_fraction = obs.get("scoreFraction", 0.0)
            diff = obs.get("difficulty", "medium")
            q_type = obs.get("questionType", "mcq")
            correctness = obs.get("correctness", "incorrect")

            if diff in diff_exposure:
                diff_exposure[diff] += 1
            if correctness in tally:
                tally[correctness] += 1

            diff_weight = DIFFICULTY_WEIGHTS.get(diff, 1.0)
            type_weight = QUESTION_TYPE_WEIGHTS.get(q_type, 1.0)
            recency_weight = self.calculate_recency_weight(
                obs.get("timestamp", reference_timestamp),
                reference_timestamp
            )

            # Unanswered count with cautious dampening: counts as 0 fraction but half weight
            obs_weight = diff_weight * type_weight * recency_weight
            if correctness == "unanswered":
                obs_weight *= 0.5

            total_weight += obs_weight
            weighted_sum += score_fraction * obs_weight

            diagnostics.append({
                "observationId": obs.get("_id") or obs.get("id"),
                "questionType": q_type,
                "difficulty": diff,
                "scoreFraction": score_fraction,
                "diffWeight": diff_weight,
                "typeWeight": type_weight,
                "recencyWeight": round(recency_weight, 3),
                "totalWeight": round(obs_weight, 3),
            })

        mastery_prob = (weighted_sum / total_weight) if total_weight > 0 else 0.0
        mastery_prob = round(max(0.0, min(1.0, mastery_prob)), 4)

        # Recent performance: average scoreFraction of last up to 3 observations
        recent_window = sorted_obs[-3:]
        recent_score = (
            sum(o.get("scoreFraction", 0.0) for o in recent_window) / len(recent_window)
            if recent_window else 0.0
        )

        return {
            "mastery_probability": mastery_prob,
            "weighted_score": round(weighted_sum, 3),
            "recent_score": round(recent_score, 4),
            "difficulty_exposure": diff_exposure,
            "tally": tally,
            "diagnostics": diagnostics,
        }

    def generate_explanation(
        self,
        concept_name: str,
        mastery_prob: float,
        confidence_level: str,
        evidence_count: int,
        tally: Dict[str, int],
        diff_exposure: Dict[str, int]
    ) -> str:
        """
        Generates a 100% deterministic, inspectable explanation of why this score was assigned.
        No LLM hallucinations or guessing.
        """
        pct = round(mastery_prob * 100)
        if evidence_count == 0:
            return f"No assessment questions have evaluated {concept_name} yet."

        parts = [
            f"Your {concept_name} estimate ({pct}%) is based on {evidence_count} graded response"
            f"{'s' if evidence_count > 1 else ''}: "
            f"{tally.get('correct', 0)} correct, {tally.get('partial', 0)} partial, and "
            f"{tally.get('incorrect', 0)} incorrect."
        ]

        # Difficulty context
        easy_c = diff_exposure.get("easy", 0)
        med_c = diff_exposure.get("medium", 0)
        hard_c = diff_exposure.get("hard", 0)

        diff_summary = []
        if hard_c > 0:
            diff_summary.append(f"{hard_c} hard")
        if med_c > 0:
            diff_summary.append(f"{med_c} medium")
        if easy_c > 0:
            diff_summary.append(f"{easy_c} easy")

        if diff_summary:
            parts.append(f"Evidence includes {', '.join(diff_summary)} questions.")

        if confidence_level == "low":
            if evidence_count < MIN_EVIDENCE_FOR_ESTIMATE:
                parts.append("Confidence is low due to limited evidence; additional practice is recommended.")
            else:
                parts.append("Performance has been variable across attempts, yielding low confidence.")
        elif confidence_level == "medium":
            parts.append("Confidence is moderate; completing additional hard questions will reinforce mastery.")
        else:
            parts.append("High confidence based on consistent multi-difficulty performance.")

        return " ".join(parts)
