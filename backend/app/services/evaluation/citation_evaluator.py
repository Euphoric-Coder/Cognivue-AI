"""
Citation Accuracy & Completeness Evaluator:
Verifies every citation points to a genuine source/chunk inside the target course,
checks PDF page / PPTX slide / Video timestamp validity, and flags fabricated citations as critical failures.
"""

from typing import Any, Dict, List, Set


class CitationEvaluator:
    """Validates emitted RAG and Multimodal citations against trusted indexed course sources."""

    @staticmethod
    def validate_citations(
        citations: List[Dict[str, Any]],
        expected_source_ids: Set[str],
        indexed_chunks_by_id: Dict[str, Dict[str, Any]],
        course_id: str,
        should_refuse: bool = False,
    ) -> Dict[str, Any]:
        if should_refuse:
            fabricated_on_refusal = len(citations) > 0
            return {
                "citationAccuracy": 0.0 if fabricated_on_refusal else 1.0,
                "citationCompleteness": 1.0,
                "validCount": 0,
                "totalEmitted": len(citations),
                "invalidReasons": ["Emitted citations on a case that required grounded refusal."] if fabricated_on_refusal else [],
                "criticalFabrication": fabricated_on_refusal,
            }

        if not citations:
            return {
                "citationAccuracy": 0.0 if expected_source_ids else 1.0,
                "citationCompleteness": 0.0 if expected_source_ids else 1.0,
                "validCount": 0,
                "totalEmitted": 0,
                "invalidReasons": ["No citations emitted for a supported factual response."] if expected_source_ids else [],
                "criticalFabrication": False,
            }

        valid_count = 0
        cited_source_ids: Set[str] = set()
        invalid_reasons: List[str] = []
        critical_fabrication = False

        for cit in citations:
            chunk_id = str(cit.get("sourceChunkId") or "")
            source_id = str(cit.get("sourceId") or "")
            chunk = indexed_chunks_by_id.get(chunk_id)

            if not chunk:
                invalid_reasons.append(f"Fabricated or missing chunkId '{chunk_id}'.")
                critical_fabrication = True
                continue

            if str(chunk.get("courseId")) != str(course_id):
                invalid_reasons.append(f"Cross-course citation leak for chunk '{chunk_id}'.")
                critical_fabrication = True
                continue

            if str(chunk.get("sourceId")) != source_id:
                invalid_reasons.append(f"Mismatched sourceId '{source_id}' for chunk '{chunk_id}'.")
                critical_fabrication = True
                continue

            loc_type = cit.get("locationType")
            if loc_type == "page" and cit.get("pageNumber") != chunk.get("pageNumber"):
                invalid_reasons.append(f"Page mismatch on '{chunk_id}'.")
                continue
            if loc_type == "slide" and cit.get("slideNumber") != chunk.get("slideNumber"):
                invalid_reasons.append(f"Slide mismatch on '{chunk_id}'.")
                continue
            if loc_type == "video":
                st = cit.get("startTime")
                en = cit.get("endTime")
                dur = chunk.get("videoDuration")
                if st is None or en is None or dur is None or not (0 <= st < en <= dur):
                    invalid_reasons.append(f"Invalid video seek timestamp ({st}-{en}/{dur}) on '{chunk_id}'.")
                    continue

            valid_count += 1
            cited_source_ids.add(source_id)

        accuracy = valid_count / len(citations)
        completeness = (
            len(cited_source_ids.intersection(expected_source_ids)) / len(expected_source_ids)
            if expected_source_ids
            else 1.0
        )

        return {
            "citationAccuracy": round(accuracy, 4),
            "citationCompleteness": round(completeness, 4),
            "validCount": valid_count,
            "totalEmitted": len(citations),
            "invalidReasons": invalid_reasons,
            "criticalFabrication": critical_fabrication,
        }

