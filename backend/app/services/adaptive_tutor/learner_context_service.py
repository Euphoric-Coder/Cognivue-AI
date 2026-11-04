"""
Learner Context Service: Selectively retrieves learner state for matched concepts and direct prerequisites.
Enforces:
- Selective loading only for directly relevant concepts + direct prerequisites (Requirement #4)
- Never dumps entire course learner model into prompt
- Handles unassessed concepts and low confidence (Requirements #8, #9)
- Privacy and course/user isolation (Requirement #56)
- Graceful fallback on unavailable model data (Requirement #63)
"""

import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class AdaptiveTutorContext:
    concept_id: Optional[str] = None
    concept_name: Optional[str] = None
    mastery_probability: Optional[float] = None
    mastery_percentage: Optional[int] = None
    mastery_band: str = "not_assessed"  # "needs_attention" | "developing" | "proficient" | "strong" | "not_assessed"
    confidence: str = "insufficient"     # "insufficient" | "low" | "medium" | "high"
    confidence_score: float = 0.0
    evidence_count: int = 0
    trend: str = "stable"
    is_unassessed: bool = True
    concept_match_confidence: float = 0.0

    prerequisite_readiness: str = "not_applicable"  # "ready" | "weak" | "developing" | "not_applicable"
    weak_prerequisites: List[Dict[str, Any]] = field(default_factory=list)
    strong_prerequisites: List[Dict[str, Any]] = field(default_factory=list)

    active_misconceptions: List[Dict[str, Any]] = field(default_factory=list)

    # Review with Tutor metadata
    review_context: Optional[Dict[str, Any]] = None


class LearnerContextService:
    def __init__(self, convex_client=None):
        self.convex_client = convex_client

    def build_learner_context(
        self,
        course_id: str,
        user_id: str,
        target_concepts: List[Dict[str, Any]],
        concept_match_confidence: float,
        learner_concept_states: List[Dict[str, Any]],
        prerequisite_analysis: Dict[str, Any],
        active_misconceptions: List[Dict[str, Any]],
        review_context: Optional[Dict[str, Any]] = None,
    ) -> AdaptiveTutorContext:
        """
        Builds a structured, isolated AdaptiveTutorContext object.
        """
        # If no target concept or low match confidence, return unassessed/neutral context
        if not target_concepts or concept_match_confidence < 0.55:
            return AdaptiveTutorContext(
                concept_id=None,
                concept_name=None,
                mastery_band="not_assessed",
                confidence="insufficient",
                is_unassessed=True,
                concept_match_confidence=concept_match_confidence,
                review_context=review_context,
            )

        primary_concept = target_concepts[0]
        cid = primary_concept.get("_id")
        cname = primary_concept.get("name")

        # Find matching learner state for primary concept
        matched_state = None
        for s in learner_concept_states:
            if s.get("conceptId") == cid or (
                s.get("conceptName") and s.get("conceptName").lower().strip() == cname.lower().strip()
            ):
                matched_state = s
                break

        if not matched_state or matched_state.get("evidenceCount", 0) == 0:
            return AdaptiveTutorContext(
                concept_id=cid,
                concept_name=cname,
                mastery_band="not_assessed",
                confidence="insufficient",
                is_unassessed=True,
                concept_match_confidence=concept_match_confidence,
                prerequisite_readiness=prerequisite_analysis.get("readiness", "not_applicable"),
                weak_prerequisites=prerequisite_analysis.get("weak_prerequisites", []),
                strong_prerequisites=prerequisite_analysis.get("strong_prerequisites", []),
                active_misconceptions=active_misconceptions,
                review_context=review_context,
            )

        prob = matched_state.get("masteryProbability")
        pct = round(prob * 100) if prob is not None else None
        band = matched_state.get("masteryBand", "not_assessed")
        conf = matched_state.get("confidence", "low")
        conf_score = matched_state.get("confidenceScore", 0.0)
        ev_count = matched_state.get("evidenceCount", 0)
        trend = matched_state.get("trend", "stable")

        return AdaptiveTutorContext(
            concept_id=cid,
            concept_name=cname,
            mastery_probability=prob,
            mastery_percentage=pct,
            mastery_band=band,
            confidence=conf,
            confidence_score=conf_score,
            evidence_count=ev_count,
            trend=trend,
            is_unassessed=False,
            concept_match_confidence=concept_match_confidence,
            prerequisite_readiness=prerequisite_analysis.get("readiness", "not_applicable"),
            weak_prerequisites=prerequisite_analysis.get("weak_prerequisites", []),
            strong_prerequisites=prerequisite_analysis.get("strong_prerequisites", []),
            active_misconceptions=active_misconceptions,
            review_context=review_context,
        )
