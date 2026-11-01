"""
Prerequisite Readiness: Assesses student readiness for concepts based on V6 Knowledge Graph prerequisite relations.
CRITICAL RULE: Prerequisite mastery and target concept mastery are separate.
Weak prerequisites flag readiness as 'needs_attention', but NEVER reduce the target concept's own mastery estimate.
"""

from typing import List, Dict, Any
from app.services.learner_model.config import (
    PREREQUISITE_MIN_PROFICIENT,
    PREREQUISITE_WEAK_THRESHOLD
)


class PrerequisiteReadinessEvaluator:
    """
    Evaluates prerequisite readiness using graph edges and current learner states.
    """

    def evaluate_readiness(
        self,
        target_concept_id: str,
        prerequisite_concept_ids: List[str],
        concept_states_by_id: Dict[str, Dict[str, Any]],
        concepts_by_id: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Calculates prerequisite readiness for a concept based strictly on PREREQUISITE_OF and DEPENDS_ON relations.
        """
        if not prerequisite_concept_ids:
            return {
                "readiness": "not_applicable",
                "prerequisiteCount": 0,
                "prerequisitesSummary": [],
            }

        summary = []
        has_weak_prereq = False
        all_ready = True

        for pid in prerequisite_concept_ids:
            p_concept = concepts_by_id.get(pid, {})
            p_state = concept_states_by_id.get(pid, {})

            p_mastery = p_state.get("masteryProbability", 0.0)
            p_band = p_state.get("masteryBand", "insufficient_evidence")

            summary.append({
                "conceptId": pid,
                "conceptName": p_concept.get("name", "Prerequisite"),
                "mastery": round(p_mastery * 100),
                "masteryBand": p_band,
            })

            if p_band == "needs_attention" or p_mastery < PREREQUISITE_WEAK_THRESHOLD:
                has_weak_prereq = True

            if p_mastery < PREREQUISITE_MIN_PROFICIENT or p_band == "insufficient_evidence":
                all_ready = False

        if has_weak_prereq:
            readiness = "needs_attention"
        elif all_ready:
            readiness = "ready"
        else:
            readiness = "developing"

        return {
            "readiness": readiness,
            "prerequisiteCount": len(prerequisite_concept_ids),
            "prerequisitesSummary": summary,
        }
