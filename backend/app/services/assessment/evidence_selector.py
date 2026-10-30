import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class EvidenceSelector:
    """
    Selects, formats, and indexes trusted source evidence from course concepts,
    concept evidence records, source chunks, and visual assets.
    """

    def __init__(self):
        pass

    def prepare_evidence_context(
        self,
        concepts: List[Dict[str, Any]],
        evidence_list: List[Dict[str, Any]],
        chunks: List[Dict[str, Any]],
        visuals: List[Dict[str, Any]],
        selected_concept_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Organizes course evidence into indexed token pools (EVIDENCE_1, EVIDENCE_2, ...)
        grouped by concept for question planning and grounding verification.
        """
        selected_ids_set = set(selected_concept_ids) if selected_concept_ids else set()

        # Map concept ID to concept
        concept_map = {str(c["_id"]): c for c in concepts}
        if selected_ids_set:
            active_concepts = [c for c in concepts if str(c["_id"]) in selected_ids_set]
            # If none matched (e.g. IDs changed), fall back to all
            if not active_concepts:
                active_concepts = concepts
        else:
            active_concepts = concepts

        token_to_evidence: Dict[str, Dict[str, Any]] = {}
        concept_evidence_map: Dict[str, List[Dict[str, Any]]] = {str(c["_id"]): [] for c in active_concepts}
        all_indexed_evidence: List[Dict[str, Any]] = []

        counter = 1

        # 1. Gather from explicit conceptEvidence records first (highest trust from V6 graph)
        for ev in evidence_list:
            c_id = str(ev.get("conceptId"))
            if c_id not in concept_evidence_map:
                continue

            token = f"EVIDENCE_{counter}"
            counter += 1

            item = {
                "token": token,
                "conceptId": c_id,
                "conceptName": concept_map.get(c_id, {}).get("name", "Unknown Concept"),
                "sourceId": str(ev.get("sourceId")),
                "sourceName": ev.get("sourceName", "Course Material"),
                "evidenceType": ev.get("evidenceType", "text"),
                "locationType": "page" if ev.get("pageNumber") is not None else ("slide" if ev.get("slideNumber") is not None else ("video" if ev.get("startTime") is not None else "document")),
                "sourceChunkId": str(ev.get("sourceChunkId")) if ev.get("sourceChunkId") else None,
                "sourceVisualId": str(ev.get("sourceVisualId")) if ev.get("sourceVisualId") else None,
                "pageNumber": float(ev["pageNumber"]) if ev.get("pageNumber") is not None else None,
                "slideNumber": float(ev["slideNumber"]) if ev.get("slideNumber") is not None else None,
                "startTime": float(ev["startTime"]) if ev.get("startTime") is not None else None,
                "endTime": float(ev["endTime"]) if ev.get("endTime") is not None else None,
                "visualType": ev.get("visualType"),
                "imageUrl": ev.get("imageUrl"),
                "excerpt": ev.get("excerpt", "")[:500],
            }
            token_to_evidence[token] = item
            concept_evidence_map[c_id].append(item)
            all_indexed_evidence.append(item)

        # 2. If certain active concepts have few evidence items, augment with relevant chunks
        for c in active_concepts:
            c_id = str(c["_id"])
            if len(concept_evidence_map[c_id]) >= 3:
                continue

            c_name_lower = c["name"].lower()
            for ch in chunks:
                ch_text = ch.get("text", "")
                is_match = (
                    str(ch.get("conceptId")) == c_id
                    or c_name_lower in ch_text.lower()
                    or (len(active_concepts) == 1 and len(chunks) == 1)
                )
                if is_match and len(ch_text) > 20:
                    token = f"EVIDENCE_{counter}"
                    counter += 1
                    loc_type = ch.get("locationType", "document")
                    item = {
                        "token": token,
                        "conceptId": c_id,
                        "conceptName": c["name"],
                        "sourceId": str(ch.get("sourceId")),
                        "sourceName": ch.get("sourceName", "Course Material"),
                        "evidenceType": "video_transcript" if loc_type == "video" else ch.get("evidenceType", "text"),
                        "locationType": loc_type,
                        "sourceChunkId": str(ch.get("_id")),
                        "sourceVisualId": None,
                        "pageNumber": float(ch["pageNumber"]) if ch.get("pageNumber") is not None else None,
                        "slideNumber": float(ch["slideNumber"]) if ch.get("slideNumber") is not None else None,
                        "startTime": float(ch["startTime"]) if ch.get("startTime") is not None else None,
                        "endTime": float(ch["endTime"]) if ch.get("endTime") is not None else None,
                        "visualType": None,
                        "imageUrl": None,
                        "excerpt": ch_text[:500],
                    }
                    token_to_evidence[token] = item
                    concept_evidence_map[c_id].append(item)
                    all_indexed_evidence.append(item)
                    if len(concept_evidence_map[c_id]) >= 3:
                        break

        # 3. Index visual assets for multimodal question eligibility
        visual_evidence_map: Dict[str, Dict[str, Any]] = {}
        for vis in visuals:
            desc = vis.get("description", "")
            title = vis.get("title", "Visual")
            v_id = str(vis["_id"])
            token = f"EVIDENCE_{counter}"
            counter += 1

            # Check if this visual mentions any active concept
            matching_concept_id = None
            for c in active_concepts:
                if c["name"].lower() in (title + " " + desc + " " + (vis.get("extractedText") or "")).lower():
                    matching_concept_id = str(c["_id"])
                    break

            item = {
                "token": token,
                "conceptId": matching_concept_id or (str(active_concepts[0]["_id"]) if active_concepts else None),
                "conceptName": concept_map.get(matching_concept_id, {}).get("name") if matching_concept_id else "Course Visual",
                "sourceId": str(vis.get("sourceId")),
                "sourceName": vis.get("sourceName", "Course Diagram"),
                "evidenceType": "visual",
                "locationType": vis.get("locationType", "page"),
                "sourceChunkId": None,
                "sourceVisualId": v_id,
                "pageNumber": float(vis["pageNumber"]) if vis.get("pageNumber") is not None else None,
                "slideNumber": float(vis["slideNumber"]) if vis.get("slideNumber") is not None else None,
                "startTime": float(vis["startTime"]) if vis.get("startTime") is not None else None,
                "endTime": float(vis["endTime"]) if vis.get("endTime") is not None else None,
                "visualType": vis.get("visualType", "diagram"),
                "imageUrl": vis.get("imageUrl"),
                "excerpt": f"[{vis.get('visualType', 'diagram').upper()}] {title}: {desc[:400]} (Visible text: {(vis.get('extractedText') or '')[:150]})",
            }
            token_to_evidence[token] = item
            visual_evidence_map[v_id] = item
            all_indexed_evidence.append(item)
            if matching_concept_id and matching_concept_id in concept_evidence_map:
                concept_evidence_map[matching_concept_id].append(item)

        return {
            "activeConcepts": active_concepts,
            "conceptEvidenceMap": concept_evidence_map,
            "tokenToEvidence": token_to_evidence,
            "allEvidence": all_indexed_evidence,
            "visualEvidenceMap": visual_evidence_map,
        }

    def format_evidence_for_prompt(self, evidence_items: List[Dict[str, Any]]) -> str:
        """Serializes evidence items into a structured prompt block with tokens [EVIDENCE_1], etc."""
        lines = []
        for ev in evidence_items:
            token = ev.get("token", "EVIDENCE")
            c_name = ev.get("conceptName", "")
            lines.append(f"[{token}]")
            lines.append(f"Associated Concept: {c_name}")
            lines.append(f"Source: {ev.get('sourceName')} ({ev.get('evidenceType')})")
            if ev.get("locationType") == "page" and ev.get("pageNumber") is not None:
                lines.append(f"Location: Page {int(ev['pageNumber'])}")
            elif ev.get("locationType") == "slide" and ev.get("slideNumber") is not None:
                lines.append(f"Location: Slide {int(ev['slideNumber'])}")
            elif ev.get("startTime") is not None and ev.get("endTime") is not None:
                lines.append(f"Location: Video {int(ev['startTime'])}s - {int(ev['endTime'])}s")
            if ev.get("visualType"):
                lines.append(f"Visual Type: {ev.get('visualType')}")
            lines.append(f"Content:\n{ev.get('excerpt', '').strip()}")
            lines.append("")
        return "\n".join(lines)
