import logging
import math
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class AssessmentPlanner:
    """
    Plans the distribution of questions across concepts, difficulties,
    and question types based on requested configuration and available evidence.
    Enforces honest evidence capacity checks (Requirement 33).
    """

    def plan_assessment(
        self,
        active_concepts: List[Dict[str, Any]],
        concept_evidence_map: Dict[str, List[Dict[str, Any]]],
        requested_count: int = 10,
        requested_difficulty: str = "mixed",
        requested_types: Optional[List[str]] = None,
        assessment_type: str = "topic_quiz",
        relationships: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Creates a structured plan for question generation.
        """
        if not active_concepts:
            return {
                "sufficientEvidence": False,
                "maxSupportedQuestions": 0,
                "insufficientEvidenceMessage": "No course concepts available. Please upload course material and build the knowledge graph first.",
                "plannedQuestions": [],
            }

        valid_types = requested_types or ["mcq", "multiple_select", "true_false", "short_answer"]
        # Filter out "numerical" if none of the evidence texts have numbers
        has_numerical_evidence = any(
            any(char.isdigit() for char in ev.get("excerpt", ""))
            for evs in concept_evidence_map.values() for ev in evs
        )
        if "numerical" in valid_types and not has_numerical_evidence:
            valid_types = [t for t in valid_types if t != "numerical"]
            if not valid_types:
                valid_types = ["mcq", "short_answer"]

        # Calculate evidence capacity per concept
        # 1 strong evidence item can reliably support up to 2 distinct questions
        concept_capacities = {}
        total_evidence_count = 0
        for c in active_concepts:
            c_id = str(c["_id"])
            ev_list = concept_evidence_map.get(c_id, [])
            total_evidence_count += len(ev_list)
            # Cap at 2 questions per evidence piece to prevent hallucinations or forced duplicates
            capacity = max(1, len(ev_list) * 2) if ev_list else 0
            concept_capacities[c_id] = capacity

        total_max_supported = sum(concept_capacities.values())

        if total_max_supported == 0:
            return {
                "sufficientEvidence": False,
                "maxSupportedQuestions": 0,
                "insufficientEvidenceMessage": "No grounded course evidence found for the selected concepts. Upload more material or select different concepts.",
                "plannedQuestions": [],
            }

        # Check for insufficient evidence (Requirement 33)
        effective_count = min(requested_count, total_max_supported)
        is_insufficient = requested_count > total_max_supported and total_max_supported < requested_count

        insufficient_message = None
        if is_insufficient:
            insufficient_message = (
                f"Cognivue found enough grounded material for {total_max_supported} high-quality questions "
                f"(requested {requested_count}). Try selecting more concepts, reducing question count, or using Mixed difficulty."
            )

        # Distribute questions evenly across concepts with capacity
        concepts_with_evidence = [c for c in active_concepts if concept_capacities.get(str(c["_id"]), 0) > 0]
        if not concepts_with_evidence:
            concepts_with_evidence = active_concepts

        num_concepts = len(concepts_with_evidence)
        base_per_concept = effective_count // num_concepts
        remainder = effective_count % num_concepts

        distribution = {}
        for i, c in enumerate(concepts_with_evidence):
            c_id = str(c["_id"])
            count = base_per_concept + (1 if i < remainder else 0)
            # ensure does not exceed concept capacity
            count = min(count, concept_capacities.get(c_id, count))
            distribution[c_id] = count

        # If any remainder was clipped by capacity, redistribute to concepts with remaining capacity
        allocated = sum(distribution.values())
        while allocated < effective_count:
            added = False
            for c in concepts_with_evidence:
                c_id = str(c["_id"])
                if distribution[c_id] < concept_capacities.get(c_id, 0):
                    distribution[c_id] += 1
                    allocated += 1
                    added = True
                    if allocated >= effective_count:
                        break
            if not added:
                break

        # Plan individual question slots
        difficulties_pool = []
        if requested_difficulty == "mixed":
            # Balanced mix: ~30% easy, ~50% medium, ~20% hard
            for i in range(allocated):
                if i % 3 == 0:
                    difficulties_pool.append("easy")
                elif i % 3 == 1:
                    difficulties_pool.append("medium")
                else:
                    difficulties_pool.append("hard")
        else:
            difficulties_pool = [requested_difficulty] * allocated

        planned_questions = []
        slot_idx = 0

        for c in concepts_with_evidence:
            c_id = str(c["_id"])
            q_count_for_concept = distribution.get(c_id, 0)
            ev_list = concept_evidence_map.get(c_id, [])

            for j in range(q_count_for_concept):
                q_diff = difficulties_pool[slot_idx % len(difficulties_pool)]
                q_type = valid_types[slot_idx % len(valid_types)]

                # Pick evidence for this slot
                if ev_list:
                    selected_ev = ev_list[j % len(ev_list)]
                    # For hard questions, try to pair with a second evidence item if available
                    paired_tokens = [selected_ev["token"]]
                    if q_diff == "hard" and len(ev_list) > 1:
                        second_ev = ev_list[(j + 1) % len(ev_list)]
                        if second_ev["token"] != selected_ev["token"]:
                            paired_tokens.append(second_ev["token"])
                else:
                    paired_tokens = []

                planned_questions.append({
                    "slotIndex": slot_idx + 1,
                    "conceptId": c_id,
                    "conceptName": c["name"],
                    "targetDifficulty": q_diff,
                    "targetType": q_type,
                    "evidenceTokens": paired_tokens,
                })
                slot_idx += 1

        logger.info(
            f"ASSESSMENT_PLAN_COMPLETE: requested={requested_count}, planned={len(planned_questions)}, "
            f"concepts={num_concepts}, sufficient={not is_insufficient}"
        )

        return {
            "sufficientEvidence": not is_insufficient,
            "maxSupportedQuestions": total_max_supported,
            "insufficientEvidenceMessage": insufficient_message,
            "conceptDistribution": distribution,
            "plannedQuestions": planned_questions,
        }
