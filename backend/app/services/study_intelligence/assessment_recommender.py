"""
Assessment Recommender for Cognivue AI Version 10.
Determines appropriate practice and quiz configurations based on learner mastery and confidence.
Never auto-starts assessments; only recommends configurations.
"""

from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


class AssessmentRecommender:
    """
    Generates recommended assessment configurations calibrated to learner mastery.
    """

    def recommend_assessment_config(
        self,
        concept: Dict[str, Any],
        learner_state: Optional[Dict[str, Any]] = None,
        related_concepts: Optional[List[Dict[str, Any]]] = None,
        is_diagnostic: bool = False,
    ) -> Dict[str, Any]:
        c_id = str(concept.get("_id", ""))
        c_name = concept.get("name", "Concept")

        if is_diagnostic or not learner_state or learner_state.get("evidenceCount", 0) == 0:
            # Diagnostic Quiz recommendation for unassessed concepts
            concept_ids = [c_id]
            concept_names = [c_name]
            if related_concepts:
                for rc in related_concepts[:3]:
                    concept_ids.append(str(rc.get("_id")))
                    concept_names.append(rc.get("name"))

            return {
                "conceptIds": concept_ids,
                "conceptNames": concept_names,
                "questionCount": 10 if is_diagnostic else 5,
                "difficulty": "medium",
                "mode": "practice",
                "isDiagnostic": True,
                "reason": f"Baseline diagnostic quiz to assess foundational understanding of {c_name} and related core topics.",
            }

        mastery_band = learner_state.get("masteryBand", "developing")
        confidence = learner_state.get("confidence", "medium")

        # Calibrated difficulty assignment (Section 17)
        if mastery_band == "needs_attention":
            difficulty = "easy"
            reason = f"Scaffolded practice quiz focusing on foundational definitions and core applications of {c_name}."
        elif mastery_band == "developing":
            difficulty = "medium"
            reason = f"Targeted practice quiz with medium difficulty to advance mastery of {c_name}."
        elif mastery_band == "proficient":
            difficulty = "medium" if confidence == "low" else "hard"
            reason = f"Consolidation quiz with challenging scenarios to reinforce proficient mastery of {c_name}."
        else: # strong
            difficulty = "hard"
            reason = f"Challenge-level quiz to verify retention and deep synthesis of {c_name}."

        concept_ids = [c_id]
        concept_names = [c_name]
        if related_concepts:
            for rc in related_concepts[:2]:
                concept_ids.append(str(rc.get("_id")))
                concept_names.append(rc.get("name"))

        return {
            "conceptIds": concept_ids,
            "conceptNames": concept_names,
            "questionCount": 5,
            "difficulty": difficulty,
            "mode": "practice",
            "isDiagnostic": False,
            "reason": reason,
        }

