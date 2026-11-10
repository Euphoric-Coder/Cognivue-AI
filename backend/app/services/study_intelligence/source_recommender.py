"""
Source Recommender Service for Cognivue AI Version 10.
Selects and ranks the best supporting course materials for a given concept,
taking into account multimodal evidence (diagrams, tables, video timestamps, slides)
and providing explainable reasons ('Why this source?'). Handles source deletion gracefully.
"""

from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class SourceRecommender:
    """
    Ranks evidence sources for a concept and provides explainable rationale.
    """

    def recommend_sources(
        self,
        concept: Dict[str, Any],
        sources: List[Dict[str, Any]],
        visuals: Optional[List[Dict[str, Any]]] = None,
        evidence_items: Optional[List[Dict[str, Any]]] = None,
        learner_state: Optional[Dict[str, Any]] = None,
        limit: int = 2,
    ) -> List[Dict[str, Any]]:
        visuals = visuals or []
        evidence_items = evidence_items or []

        # Map available ready sources (ignoring deleted/unavailable sources)
        ready_sources_by_id = {
            str(s.get("_id")): s
            for s in sources
            if s.get("status") == "ready" and not s.get("isArchived", False)
        }

        if not ready_sources_by_id:
            return []

        c_id = str(concept.get("_id", ""))
        c_name = concept.get("name", "")

        # Group visuals by source
        visuals_by_source: Dict[str, List[Dict[str, Any]]] = {}
        for v in visuals:
            s_id = str(v.get("sourceId", ""))
            if s_id in ready_sources_by_id:
                if s_id not in visuals_by_source:
                    visuals_by_source[s_id] = []
                visuals_by_source[s_id].append(v)

        # Match evidence items linked to this concept
        concept_evidence = [
            e for e in evidence_items
            if str(e.get("conceptId", "")) == c_id or str(e.get("conceptName", "")).lower() == c_name.lower()
        ]

        scored_candidates = []

        for s_id, source in ready_sources_by_id.items():
            score = 10.0 # base score
            source_type = source.get("type", "document")
            source_name = source.get("name", "Course Material")
            source_visuals = visuals_by_source.get(s_id, [])

            # Check direct evidence link
            matching_ev = [e for e in concept_evidence if str(e.get("sourceId", "")) == s_id]
            if matching_ev:
                score += 30.0

            # Modality and visual clarity evaluation (V5)
            modality = source_type
            location_type = "page" if source_type == "pdf" else ("slide" if source_type == "pptx" else "timestamp")
            location_value = None
            evidence_reason = f"Primary {source_type.upper()} material covering {c_name}."

            # Check for visual diagram or table
            has_diagram = any(
                v.get("locationType") in ("slide", "page") and (v.get("diagramCount", 0) > 0 or "diagram" in str(v.get("visualId", "")).lower())
                for v in source_visuals
            )
            has_table = any(
                v.get("tableCount", 0) > 0 or "table" in str(v.get("visualId", "")).lower()
                for v in source_visuals
            )

            if has_diagram:
                score += 20.0
                modality = "diagram"
                best_v = next(v for v in source_visuals if v.get("diagramCount", 0) > 0 or "diagram" in str(v.get("visualId", "")).lower())
                location_value = best_v.get("slideNumber") or best_v.get("pageNumber") or 1
                location_type = "slide" if source_type == "pptx" else "page"
                evidence_reason = f"Contains an architectural or conceptual diagram on {location_type} {location_value} illustrating {c_name}."
            elif has_table:
                score += 15.0
                modality = "table"
                best_v = next(v for v in source_visuals if v.get("tableCount", 0) > 0 or "table" in str(v.get("visualId", "")).lower())
                location_value = best_v.get("slideNumber") or best_v.get("pageNumber") or 1
                evidence_reason = f"Contains a structured comparison table on {location_type} {location_value}."
            elif source_type == "video":
                score += 18.0
                modality = "video"
                location_type = "timestamp"
                # If specific evidence has timestamp, use it
                if matching_ev and matching_ev[0].get("startTime") is not None:
                    start_s = int(matching_ev[0]["startTime"])
                    end_s = int(matching_ev[0].get("endTime", start_s + 60))
                    location_value = f"{start_s // 60:02d}:{start_s % 60:02d}–{end_s // 60:02d}:{end_s % 60:02d}"
                    evidence_reason = f"Lecture video segment ({location_value}) directly explaining {c_name}."
                else:
                    location_value = "00:00"
                    evidence_reason = f"Video lecture covering key explanations and examples for {c_name}."
            else:
                if matching_ev and matching_ev[0].get("pageNumber") is not None:
                    location_value = matching_ev[0]["pageNumber"]
                    evidence_reason = f"Section on page {location_value} detailing definitions and formulas for {c_name}."

            # Learner need boost: if learner is weak, diagrams and videos are especially beneficial
            if learner_state and learner_state.get("masteryBand") in ("needs_attention", "developing"):
                if modality in ("diagram", "video"):
                    score += 10.0

            scored_candidates.append({
                "sourceId": s_id,
                "sourceName": source_name,
                "locationType": location_type,
                "locationValue": location_value,
                "modality": modality,
                "evidenceReason": evidence_reason,
                "score": score,
            })

        # Sort descending by score
        scored_candidates.sort(key=lambda x: x["score"], reverse=True)
        return scored_candidates[:limit]

