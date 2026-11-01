"""
Trend Analyzer: Evaluates learning trajectory across chronological observations.
"""

from typing import List, Dict, Any, Tuple
from app.services.learner_model.config import MIN_EVIDENCE_FOR_TREND


class TrendAnalyzer:
    """
    Determines if a student's performance on a concept is improving, stable, declining, or insufficient_data.
    """

    def analyze_trend(self, observations: List[Dict[str, Any]]) -> Tuple[str, float]:
        """
        Calculates trend by comparing the most recent 2 observations against prior observations.
        Requires at least MIN_EVIDENCE_FOR_TREND observations.
        Returns:
            trend: "improving" | "stable" | "declining" | "insufficient_data"
            delta: float
        """
        if len(observations) < MIN_EVIDENCE_FOR_TREND:
            return "insufficient_data", 0.0

        sorted_obs = sorted(observations, key=lambda x: x.get("timestamp", 0))

        # Recent slice: last 2 observations
        recent = sorted_obs[-2:]
        # Prior slice: up to 3 observations before the recent slice
        prior = sorted_obs[:-2][-3:]

        if not prior:
            return "insufficient_data", 0.0

        recent_avg = sum(o.get("scoreFraction", 0.0) for o in recent) / len(recent)
        prior_avg = sum(o.get("scoreFraction", 0.0) for o in prior) / len(prior)
        delta = round(recent_avg - prior_avg, 3)

        if delta > 0.08:
            return "improving", delta
        elif delta < -0.08:
            return "declining", delta
        else:
            return "stable", delta
