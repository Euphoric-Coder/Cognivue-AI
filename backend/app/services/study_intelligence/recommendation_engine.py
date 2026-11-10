"""
Recommendation Engine for Cognivue AI Version 10.
Coordinates PriorityEngine, SourceRecommender, AssessmentRecommender, and SpacedReviewEngine
to produce comprehensive, explainable personal study recommendations.
"""

from typing import List, Dict, Any, Optional
import time
import logging

from app.services.study_intelligence.priority_engine import PriorityEngine
from app.services.study_intelligence.source_recommender import SourceRecommender
from app.services.study_intelligence.assessment_recommender import AssessmentRecommender
from app.services.study_intelligence.spaced_review_engine import SpacedReviewEngine

logger = logging.getLogger(__name__)


class RecommendationEngine:
    """
    Coordinates sub-engines to produce deterministic study recommendations.
    """

    def __init__(self):
        self.priority_engine = PriorityEngine()
        self.source_recommender = SourceRecommender()
        self.assessment_recommender = AssessmentRecommender()
        self.spaced_review_engine = SpacedReviewEngine()

    def generate_recommendations(
        self,
        course_id: str,
        user_id: str,
        concepts: List[Dict[str, Any]],
        learner_states: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
        active_misconceptions: List[Dict[str, Any]],
        review_states: List[Dict[str, Any]],
        sources: List[Dict[str, Any]],
        visuals: Optional[List[Dict[str, Any]]] = None,
        evidence_items: Optional[List[Dict[str, Any]]] = None,
        exam_target_date: Optional[str] = None,
        now_ms: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        visuals = visuals or []
        evidence_items = evidence_items or []

        states_by_concept_id = {str(s.get("conceptId")): s for s in learner_states if "conceptId" in s}
        review_states_by_concept_id = {str(r.get("conceptId")): r for r in review_states if "conceptId" in r}

        # 1. Map prerequisite blockers
        prereq_for_map = {}
        for r in relationships:
            rel_type = r.get("relationType")
            if rel_type in ("PREREQUISITE_OF", "DEPENDS_ON"):
                prereq_id = str(r.get("fromConceptId") if rel_type == "PREREQUISITE_OF" else r.get("toConceptId"))
                dep_id = str(r.get("toConceptId") if rel_type == "PREREQUISITE_OF" else r.get("fromConceptId"))
                if prereq_id not in prereq_for_map:
                    prereq_for_map[prereq_id] = []
                prereq_for_map[prereq_id].append(dep_id)

        prereq_for_weak = set()
        for prereq_id, dep_ids in prereq_for_map.items():
            prereq_state = states_by_concept_id.get(prereq_id)
            prereq_mastery = float(prereq_state.get("masteryProbability", 0)) if prereq_state else 0.0
            if prereq_mastery < 0.70:
                for dep_id in dep_ids:
                    dep_state = states_by_concept_id.get(dep_id)
                    dep_mastery = float(dep_state.get("masteryProbability", 0)) if dep_state else 0.0
                    if dep_mastery < 0.70:
                        prereq_for_weak.add(prereq_id)
                        break

        # 2. Generate recommendation for each concept
        recommendations = []

        for concept in concepts:
            c_id = str(concept.get("_id", ""))
            learner_state = states_by_concept_id.get(c_id)
            review_state = review_states_by_concept_id.get(c_id)
            is_blocker = c_id in prereq_for_weak

            priority_res = self.priority_engine.calculate_priority(
                concept=concept,
                learner_state=learner_state,
                active_misconceptions=active_misconceptions,
                is_prereq_for_weak=is_blocker,
                review_state=review_state,
                exam_target_date=exam_target_date,
                now_ms=now_ms,
            )

            # Recommend best supporting evidence source
            recommended_sources = self.source_recommender.recommend_sources(
                concept=concept,
                sources=sources,
                visuals=visuals,
                evidence_items=evidence_items,
                learner_state=learner_state,
                limit=2,
            )

            # Recommend practice / diagnostic assessment config
            assessment_config = self.assessment_recommender.recommend_assessment_config(
                concept=concept,
                learner_state=learner_state,
                is_diagnostic=(learner_state is None or learner_state.get("evidenceCount", 0) == 0),
            )

            rec = {
                "userId": user_id,
                "courseId": course_id,
                "conceptId": c_id,
                "conceptName": concept.get("name", "Concept"),
                "conceptKey": concept.get("normalizedName"),
                "recommendationType": priority_res["recommendationType"],
                "priorityScore": priority_res["priorityScore"],
                "priorityBand": priority_res["priorityBand"],
                "reasonCodes": priority_res["reasonCodes"],
                "reasonSummary": priority_res["reasonSummary"],
                "reasonDetails": priority_res["reasonDetails"],
                "recommendedSourceIds": recommended_sources,
                "recommendedAssessmentConfig": assessment_config,
                "dueAt": (review_state.get("nextReviewAt") if review_state else None) or (now_ms + 86400000 * 3),
                "status": "active",
                "recommendationVersion": "study-v1",
                "generatedAt": now_ms,
                "updatedAt": now_ms,
                "diagnostics": priority_res.get("diagnostics"),
            }

            recommendations.append(rec)

        # Sort descending by priorityScore
        recommendations.sort(key=lambda r: float(r["priorityScore"]), reverse=True)
        return recommendations

