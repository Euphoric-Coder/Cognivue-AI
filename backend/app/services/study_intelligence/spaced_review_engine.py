"""
Spaced Review Engine for Cognivue AI Version 10.
Implements an explainable, deterministic heuristic spaced repetition schedule.
Extends review intervals on success (1d -> 3d -> 7d -> 14d -> 30d) and shortens on errors.
Timezone-aware date calculations.
"""

from typing import Dict, Any, Optional
import time
import math
import logging

logger = logging.getLogger(__name__)

# Heuristic Interval Progression (days)
INTERVAL_PROGRESSION = [1, 3, 7, 14, 30, 60]

BASE_INTERVALS_BY_BAND = {
    "needs_attention": 1,
    "developing": 3,
    "proficient": 7,
    "strong": 14,
    "insufficient_evidence": 1,
}


class SpacedReviewEngine:
    """
    Manages concept review state scheduling and interval transitions.
    """

    def compute_next_review(
        self,
        current_review_state: Optional[Dict[str, Any]],
        learner_state: Optional[Dict[str, Any]],
        outcome: str, # "success" | "fail"
        now_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        mastery_band = learner_state.get("masteryBand", "developing") if learner_state else "developing"
        base_days = BASE_INTERVALS_BY_BAND.get(mastery_band, 3)

        current_interval = int(current_review_state.get("reviewIntervalDays", base_days)) if current_review_state else base_days
        successful_reviews = int(current_review_state.get("successfulReviews", 0)) if current_review_state else 0
        failed_reviews = int(current_review_state.get("failedReviews", 0)) if current_review_state else 0

        if outcome == "success":
            successful_reviews += 1
            # Extend interval to next tier
            next_interval = self._get_next_higher_interval(current_interval)
        else:
            failed_reviews += 1
            # Reset or reduce interval
            next_interval = 1 if current_interval <= 3 else math.ceil(current_interval / 2)

        next_review_ms = now_ms + (next_interval * 24 * 60 * 60 * 1000)

        return {
            "lastReviewedAt": now_ms,
            "nextReviewAt": next_review_ms,
            "reviewIntervalDays": next_interval,
            "successfulReviews": successful_reviews,
            "failedReviews": failed_reviews,
            "lastReviewOutcome": outcome,
        }

    def is_review_due(
        self,
        review_state: Optional[Dict[str, Any]],
        learner_state: Optional[Dict[str, Any]],
        now_ms: Optional[int] = None,
    ) -> bool:
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        if review_state and review_state.get("nextReviewAt"):
            return now_ms >= int(review_state["nextReviewAt"])

        # Fallback to lastObservedAt
        if learner_state and learner_state.get("lastObservedAt") and learner_state.get("evidenceCount", 0) > 0:
            last_obs = int(learner_state["lastObservedAt"])
            mastery_band = learner_state.get("masteryBand", "developing")
            interval_days = BASE_INTERVALS_BY_BAND.get(mastery_band, 7)
            return (now_ms - last_obs) >= (interval_days * 24 * 60 * 60 * 1000)

        return False

    def _get_next_higher_interval(self, current: int) -> int:
        for val in INTERVAL_PROGRESSION:
            if val > current:
                return val
        return 60

