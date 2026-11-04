"""
Prerequisite Service: Identifies prerequisite relationships and analyzes prerequisite weaknesses.
Enforces:
- At most 1-2 most relevant weak prerequisites (Requirement #17)
- Never forces prerequisite review if prerequisites are strong (Requirement #16)
- Safe fallback if graph or state is unavailable (Requirement #65)
"""

import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class PrerequisiteService:
    def __init__(self, convex_client=None):
        self.convex_client = convex_client

    def find_prerequisites(
        self,
        target_concept_id: str,
        relationships: List[Dict[str, Any]],
        concepts_by_id: Dict[str, Dict[str, Any]],
        learner_states_by_concept_id: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Analyzes prerequisites for a target concept.
        Returns:
        {
            "has_prerequisites": bool,
            "has_weak_prerequisites": bool,
            "readiness": "ready" | "weak" | "not_applicable",
            "weak_prerequisites": [
                {
                    "conceptId": str,
                    "conceptName": str,
                    "masteryProbability": float,
                    "masteryPercentage": int,
                    "masteryBand": str,
                    "confidence": str
                }
            ],
            "strong_prerequisites": [ ... ]
        }
        """
        if not target_concept_id or not relationships:
            return {
                "has_prerequisites": False,
                "has_weak_prerequisites": False,
                "readiness": "not_applicable",
                "weak_prerequisites": [],
                "strong_prerequisites": [],
            }

        prereq_concept_ids = set()
        for rel in relationships:
            rel_type = (rel.get("relationType") or "").upper()
            if rel_type in ("PREREQUISITE_OF", "DEPENDS_ON"):
                # "fromConcept" is PREREQUISITE_OF "toConcept"
                if rel.get("toConceptId") == target_concept_id:
                    prereq_concept_ids.add(rel.get("fromConceptId"))
                elif rel.get("fromConceptId") == target_concept_id and rel_type == "DEPENDS_ON":
                    prereq_concept_ids.add(rel.get("toConceptId"))

        if not prereq_concept_ids:
            return {
                "has_prerequisites": False,
                "has_weak_prerequisites": False,
                "readiness": "not_applicable",
                "weak_prerequisites": [],
                "strong_prerequisites": [],
            }

        weak_list = []
        strong_list = []

        confidence_ranks = {"high": 3, "medium": 2, "low": 1, "insufficient": 0}

        for pid in prereq_concept_ids:
            if not pid or pid not in concepts_by_id:
                continue

            concept = concepts_by_id[pid]
            state = learner_states_by_concept_id.get(pid, {})

            mastery = state.get("masteryProbability")
            band = state.get("masteryBand", "not_assessed")
            conf = state.get("confidence", "insufficient")

            prereq_info = {
                "conceptId": pid,
                "conceptName": concept.get("name", "Prerequisite"),
                "masteryProbability": mastery,
                "masteryPercentage": round(mastery * 100) if mastery is not None else None,
                "masteryBand": band,
                "confidence": conf,
            }

            # Weak prerequisite: explicitly low mastery (< 0.60) or band needs_attention/developing
            if mastery is not None and (mastery < 0.60 or band in ("needs_attention", "developing")):
                weak_list.append(prereq_info)
            elif mastery is not None and mastery >= 0.80 and conf in ("medium", "high"):
                strong_list.append(prereq_info)

        # Sort weak prerequisites by:
        # 1. Weakest mastery probability (ascending)
        # 2. Confidence level (descending)
        weak_list.sort(
            key=lambda x: (
                x["masteryProbability"] if x["masteryProbability"] is not None else 1.0,
                -confidence_ranks.get(x["confidence"], 0),
            )
        )

        # Limit to at most 1-2 most relevant weak prerequisites (Requirement #17)
        top_weak = weak_list[:2]
        has_weak = len(top_weak) > 0
        readiness = "weak" if has_weak else ("ready" if len(strong_list) > 0 else "developing")

        return {
            "has_prerequisites": True,
            "has_weak_prerequisites": has_weak,
            "readiness": readiness,
            "weak_prerequisites": top_weak,
            "strong_prerequisites": strong_list,
        }
