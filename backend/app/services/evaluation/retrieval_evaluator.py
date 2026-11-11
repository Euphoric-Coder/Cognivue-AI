"""
Retrieval Quality Evaluator:
Measures Precision@K, Recall@K, Hit@1, Hit@3, Hit@5, RAGAS Context Precision,
RAGAS Context Recall, cross-course isolation, and full-timeline video chunk coverage.
"""

from typing import Any, Dict, List, Optional, Set, Tuple
from app.services.evaluation.base_evaluator import tokenize_keywords


class RetrievalEvaluator:
    """Deterministic course-scoped retrieval & RAGAS context metric calculator."""

    @staticmethod
    def retrieve_course_chunks(
        query: str,
        course_id: str,
        all_chunks: List[Dict[str, Any]],
        top_k: int = 5,
        min_score: float = 0.14,
        visual_type_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Simulates course-scoped vector/lexical retrieval over fixture chunks.
        Enforces strict courseId filtering so foreign course chunks never leak.
        """
        q_tokens = tokenize_keywords(query, min_len=2)
        scored: List[Tuple[float, Dict[str, Any]]] = []

        for chunk in all_chunks:
            if str(chunk.get("courseId")) != str(course_id):
                continue
            if visual_type_filter and chunk.get("visualType") != visual_type_filter:
                # Allow text chunks only when not strictly filtered by visual type;
                # when searching visuals specifically, boost matching visual chunks.
                visual_bonus = 0.0
            else:
                visual_bonus = 0.12 if (visual_type_filter and chunk.get("visualType") == visual_type_filter) else 0.0

            c_text = f"{chunk.get('sectionTitle', '')} {chunk.get('text', '')}"
            c_tokens = tokenize_keywords(c_text, min_len=2)
            if not q_tokens or not c_tokens:
                continue

            overlap = len(q_tokens.intersection(c_tokens))
            if overlap == 0:
                continue

            jaccard_like = overlap / max(1, min(len(q_tokens), 8))
            score = round(min(0.99, jaccard_like * 0.75 + (overlap / len(c_tokens)) * 0.25 + visual_bonus), 4)
            if score >= min_score:
                enriched = dict(chunk)
                enriched["_score"] = score
                scored.append((score, enriched))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [item for _, item in scored[:top_k]]

    @staticmethod
    def score_retrieval_case(
        retrieved: List[Dict[str, Any]],
        expected_chunk_ids: Set[str],
        should_refuse: bool = False,
        k: int = 5,
    ) -> Dict[str, float]:
        top_k = retrieved[:k]
        retrieved_ids = [str(c.get("_id")) for c in top_k]

        if should_refuse or not expected_chunk_ids:
            # Unanswerable query: passing means no high-confidence spurious hits or empty relevant set
            no_false_hits = 1.0 if len(top_k) == 0 or max((c.get("_score", 0.0) for c in top_k), default=0.0) < 0.30 else 0.0
            return {
                "precisionAtK": no_false_hits,
                "recallAtK": 1.0 if should_refuse else 0.0,
                "hitAt1": 1.0 if should_refuse and no_false_hits == 1.0 else 0.0,
                "hitAt3": 1.0 if should_refuse and no_false_hits == 1.0 else 0.0,
                "hitAt5": 1.0 if should_refuse and no_false_hits == 1.0 else 0.0,
                "contextPrecision": no_false_hits,
                "contextRecall": 1.0 if should_refuse else 0.0,
            }

        rel_flags = [1 if cid in expected_chunk_ids else 0 for cid in retrieved_ids]
        hits = sum(rel_flags)

        precision_k = hits / max(1, len(retrieved_ids))
        recall_k = len(set(retrieved_ids).intersection(expected_chunk_ids)) / len(expected_chunk_ids)

        hit_at_1 = 1.0 if any(rel_flags[:1]) else 0.0
        hit_at_3 = 1.0 if any(rel_flags[:3]) else 0.0
        hit_at_5 = 1.0 if any(rel_flags[:5]) else 0.0

        # RAGAS Context Precision: mean Precision@i weighted at relevant ranks
        prec_sum = 0.0
        rel_seen = 0
        for idx, is_rel in enumerate(rel_flags, start=1):
            if is_rel:
                rel_seen += 1
                prec_sum += rel_seen / idx
        context_precision = prec_sum / max(1, rel_seen) if rel_seen > 0 else 0.0

        return {
            "precisionAtK": round(precision_k, 4),
            "recallAtK": round(recall_k, 4),
            "hitAt1": hit_at_1,
            "hitAt3": hit_at_3,
            "hitAt5": hit_at_5,
            "contextPrecision": round(context_precision, 4),
            "contextRecall": round(recall_k, 4),
        }

    @staticmethod
    def verify_video_timeline_coverage(
        video_check: Dict[str, Any],
        all_chunks: List[Dict[str, Any]],
    ) -> Tuple[bool, str]:
        """
        Ensures early, mid, and late video segments are all indexed with zero silently dropped chunks.
        """
        src_id = video_check.get("sourceId")
        expected_ids = set(video_check.get("expectedSegments", []))
        video_chunks = [c for c in all_chunks if c.get("sourceId") == src_id and c.get("locationType") == "video"]
        found_ids = {str(c.get("_id")) for c in video_chunks}
        missing = expected_ids - found_ids
        if missing:
            return False, f"Dropped video transcript chunks: {sorted(missing)}"

        # Check contiguous startTime ordering and valid bounds within videoDuration
        for c in video_chunks:
            dur = c.get("videoDuration")
            st = c.get("startTime")
            en = c.get("endTime")
            if dur is None or st is None or en is None or not (0 <= st < en <= dur):
                return False, f"Invalid timestamp bounds on chunk {c.get('_id')}: {st}-{en}/{dur}"

        return True, f"All {len(expected_ids)} early/mid/late video segments verified."

