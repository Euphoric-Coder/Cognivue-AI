"""
Confidence Engine: Computes independent confidence scores and determines mastery bands.
Guarantees that low evidence or single easy questions never produce false high confidence or strong band.
"""

import math
from typing import List, Dict, Any, Tuple
from app.services.learner_model.config import (
    MIN_EVIDENCE_FOR_ESTIMATE,
    MIN_EVIDENCE_FOR_STRONG,
    CONFIDENCE_THRESHOLDS
)


class ConfidenceEngine:
    """
    Evaluates observation volume, difficulty diversity, and score consistency.
    """

    def compute_confidence(
        self,
        observations: List[Dict[str, Any]],
        diff_exposure: Dict[str, int]
    ) -> Tuple[float, str]:
        """
        Calculates confidence score (0.0 to 1.0) and level ("low", "medium", "high").
        Formula combines:
        1. Volume component (50%): min(1.0, count / 5.0)
        2. Difficulty diversity (25%): count of distinct difficulty tiers / 3.0
        3. Score consistency (25%): 1.0 - standard_deviation
        """
        count = len(observations)
        if count == 0:
            return 0.0, "low"

        # 1. Volume factor
        volume_factor = min(1.0, count / float(MIN_EVIDENCE_FOR_STRONG))

        # 2. Difficulty diversity factor
        distinct_diffs = sum(1 for d in ("easy", "medium", "hard") if diff_exposure.get(d, 0) > 0)
        diversity_factor = distinct_diffs / 3.0

        # 3. Consistency factor (lower variance = higher consistency)
        if count == 1:
            consistency_factor = 0.5
        else:
            scores = [o.get("scoreFraction", 0.0) for o in observations]
            mean_score = sum(scores) / count
            variance = sum((s - mean_score) ** 2 for s in scores) / count
            std_dev = math.sqrt(variance)
            consistency_factor = max(0.0, 1.0 - (std_dev * 1.5))

        raw_score = (volume_factor * 0.50) + (diversity_factor * 0.25) + (consistency_factor * 0.25)
        conf_score = round(max(0.0, min(1.0, raw_score)), 3)

        if count < MIN_EVIDENCE_FOR_ESTIMATE:
            return min(0.34, conf_score), "low"

        if conf_score >= CONFIDENCE_THRESHOLDS["high"]:
            level = "high"
        elif conf_score >= CONFIDENCE_THRESHOLDS["medium"]:
            level = "medium"
        else:
            level = "low"

        return conf_score, level

    def determine_mastery_band(
        self,
        mastery_prob: float,
        evidence_count: int,
        confidence_level: str
    ) -> str:
        """
        Maps probability and confidence to a human-readable mastery band.
        Guarantees that low evidence concepts are never labeled strong or proficient.
        """
        if evidence_count == 0:
            return "insufficient_evidence"

        if evidence_count < MIN_EVIDENCE_FOR_ESTIMATE:
            # Low / provisional evidence: cannot claim strong or proficient
            return "developing" if mastery_prob >= 0.60 else "needs_attention"

        if mastery_prob >= 0.80:
            # Requires at least medium confidence to be labeled strong
            return "strong" if confidence_level != "low" else "proficient"
        elif mastery_prob >= 0.60:
            return "proficient"
        elif mastery_prob >= 0.40:
            return "developing"
        else:
            return "needs_attention"
