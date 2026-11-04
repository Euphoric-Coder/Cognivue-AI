"""
Misconception Service: Retrieves and matches active learner misconceptions for target concepts.
Enforces:
- Misconceptions come strictly from observed assessment evidence (Requirement #27, #30)
- Never invents misconceptions without evidence
- Fails gracefully if lookup fails (Requirement #64)
- Formats non-accusatory, evidence-backed distinctions (Requirement #25, #72)
"""

import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class MisconceptionService:
    def __init__(self, convex_client=None):
        self.convex_client = convex_client

    def find_active_misconceptions(
        self,
        concept_ids: List[str],
        concept_names: List[str],
        misconceptions: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Filters misconceptions that are active and relevant to the target concept(s).
        """
        if not misconceptions:
            return []

        concept_id_set = set(concept_ids or [])
        concept_name_set = {n.lower().strip() for n in (concept_names or []) if n}

        matched = []
        for m in misconceptions:
            if not m.get("active", True):
                continue

            m_concept_id = m.get("conceptId")
            m_concept_name = (m.get("conceptName") or "").lower().strip()

            is_match = False
            if m_concept_id and m_concept_id in concept_id_set:
                is_match = True
            elif m_concept_name and m_concept_name in concept_name_set:
                is_match = True
            elif any(cn in (m.get("misconceptionKey") or "") for cn in concept_name_set):
                is_match = True

            if is_match:
                matched.append({
                    "id": m.get("_id"),
                    "misconceptionKey": m.get("misconceptionKey"),
                    "description": m.get("description"),
                    "evidenceCount": m.get("evidenceCount", 1),
                    "confidence": m.get("confidence", "low"),
                    "confidenceScore": m.get("confidenceScore", 0.4),
                })

        # Rank by confidence score descending, then evidence count
        matched.sort(key=lambda x: (x["confidenceScore"], x["evidenceCount"]), reverse=True)
        return matched[:2]  # Return at most 2 most prominent active misconceptions

    def format_misconception_guidance(self, misconceptions: List[Dict[str, Any]]) -> str:
        """
        Builds pedagogical instruction for addressing misconceptions neutrally.
        """
        if not misconceptions:
            return ""

        descriptions = [m["description"] for m in misconceptions if m.get("description")]
        if not descriptions:
            return ""

        lines = [
            "ACTIVE LEARNER MISCONCEPTION DETECTED IN PRIOR ASSESSMENTS:",
            f"- Known confusion: {'; '.join(descriptions)}",
            "INSTRUCTION FOR TUTOR:",
            "- Explicitly clarify this distinction using course evidence (e.g., 'One distinction worth keeping clear is...').",
            "- Do NOT accuse or say 'You made a mistake before'. Keep phrasing objective and evidence-based.",
        ]
        return "\n".join(lines)
