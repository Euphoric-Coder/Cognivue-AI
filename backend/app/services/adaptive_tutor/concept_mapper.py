"""
Concept Mapper: Maps user queries to Knowledge Graph course concepts with confidence scoring.
Enforces:
- At most 1-2 directly relevant concepts
- Deterministic match confidence scoring
- Fallback on low confidence (< 0.60)
"""

import logging
import re
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class ConceptMapper:
    def __init__(self, convex_client=None):
        self.convex_client = convex_client

    def normalize_text(self, text: str) -> str:
        return re.sub(r"[^a-z0-9\s]", " ", (text or "").lower()).strip()

    def map_query_to_concepts(
        self,
        query: str,
        course_concepts: List[Dict[str, Any]],
        focus_concept_id: Optional[str] = None,
        review_concepts: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[List[Dict[str, Any]], float]:
        """
        Maps a query or review context to 1-2 course concepts.
        Returns: (matched_concepts, concept_match_confidence)
        """
        if not course_concepts:
            return [], 0.0

        concepts_by_id = {c["_id"]: c for c in course_concepts if "_id" in c}

        # 1. Direct override: Review with Tutor passes verified concept context
        if review_concepts:
            valid_review = []
            for rc in review_concepts:
                cid = rc.get("id") or rc.get("_id")
                if cid and cid in concepts_by_id:
                    valid_review.append(concepts_by_id[cid])
                elif rc.get("name"):
                    # Find by name
                    rc_name_norm = self.normalize_text(rc.get("name"))
                    for c in course_concepts:
                        if self.normalize_text(c.get("name")) == rc_name_norm:
                            valid_review.append(c)
                            break
            if valid_review:
                return valid_review[:2], 1.0

        # 2. Direct override: focusConceptId provided from UI navigation (e.g. Progress / Knowledge Map)
        if focus_concept_id and focus_concept_id in concepts_by_id:
            return [concepts_by_id[focus_concept_id]], 1.0

        if not query or not query.strip():
            return [], 0.0

        norm_query = self.normalize_text(query)
        query_words = set(norm_query.split())

        candidates = []

        for concept in course_concepts:
            c_name = concept.get("name", "")
            norm_name = self.normalize_text(c_name)
            if not norm_name:
                continue

            name_words = set(norm_name.split())
            score = 0.0
            match_type = "none"

            # Check full exact match
            if norm_name == norm_query:
                score = 1.0
                match_type = "exact_full"
            # Check exact substring with word boundaries
            elif re.search(r"\b" + re.escape(norm_name) + r"\b", norm_query):
                score = 0.95
                match_type = "exact_subphrase"
            # Check if all name words appear in query
            elif name_words and name_words.issubset(query_words):
                score = 0.85
                match_type = "all_words_present"
            # Check aliases if available
            else:
                aliases = concept.get("aliases") or []
                matched_alias = False
                for alias in aliases:
                    norm_alias = self.normalize_text(alias)
                    if norm_alias and re.search(r"\b" + re.escape(norm_alias) + r"\b", norm_query):
                        score = 0.90
                        match_type = "alias_match"
                        matched_alias = True
                        break

                if not matched_alias and name_words:
                    # Token overlap (Jaccard similarity)
                    intersection = name_words.intersection(query_words)
                    if len(intersection) >= 2 or (len(name_words) == 1 and len(intersection) == 1 and len(norm_name) > 3):
                        jaccard = len(intersection) / len(name_words)
                        if jaccard >= 0.5:
                            score = 0.65 * jaccard
                            match_type = "token_overlap"

            if score > 0.0:
                candidates.append({
                    "concept": concept,
                    "score": round(score, 3),
                    "match_type": match_type,
                })

        if not candidates:
            logger.info("ADAPTIVE_TUTOR_NO_CONCEPT_MATCH")
            return [], 0.0

        # Sort candidates by match score descending, then importance
        importance_weights = {"core": 3, "supporting": 2, "minor": 1}
        candidates.sort(
            key=lambda x: (
                x["score"],
                importance_weights.get(x["concept"].get("importance", "supporting"), 1),
                len(x["concept"].get("name", "")),
            ),
            reverse=True,
        )

        top_match = candidates[0]
        top_confidence = top_match["score"]

        # Only accept matches if top confidence >= 0.55
        if top_confidence < 0.55:
            logger.info(f"ADAPTIVE_TUTOR_LOW_CONFIDENCE_MATCH: score={top_confidence}")
            return [], top_confidence

        # Limit to at most 1 or 2 relevant concepts
        selected = [top_match["concept"]]
        if len(candidates) > 1 and candidates[1]["score"] >= 0.80:
            selected.append(candidates[1]["concept"])

        logger.info(
            f"ADAPTIVE_TUTOR_CONCEPT_MATCH: concepts={[c['name'] for c in selected]} confidence={top_confidence}"
        )
        return selected, top_confidence
