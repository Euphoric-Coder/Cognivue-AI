import re
from typing import List, Dict, Any, Set

class DuplicateDetector:
    """
    Detects semantic and literal duplicate questions inside an assessment pool
    using normalized n-grams, stop-word stripped token Jaccard similarity,
    concept overlap, and correct answer similarity.
    """

    STOP_WORDS = {
        "a", "an", "the", "in", "on", "of", "at", "by", "for", "with", "about",
        "against", "between", "into", "through", "during", "before", "after",
        "above", "below", "to", "from", "up", "down", "is", "are", "was", "were",
        "be", "been", "being", "have", "has", "had", "do", "does", "did", "which",
        "what", "when", "where", "who", "whom", "this", "that", "these", "those",
        "according", "statement", "describes", "best", "following", "correctly", "option"
    }

    def normalize_text(self, text: str) -> str:
        text = text.lower()
        text = re.sub(r"[^\w\s]", "", text)
        return " ".join(text.split())

    def get_keywords(self, text: str) -> Set[str]:
        words = self.normalize_text(text).split()
        return {w for w in words if w not in self.STOP_WORDS and len(w) > 2}

    def compute_jaccard_similarity(self, set_a: Set[str], set_b: Set[str]) -> float:
        if not set_a or not set_b:
            return 0.0
        intersection = len(set_a.intersection(set_b))
        union = len(set_a.union(set_b))
        return intersection / union if union > 0 else 0.0

    def is_duplicate(
        self,
        candidate_question: Dict[str, Any],
        existing_questions: List[Dict[str, Any]],
        similarity_threshold: float = 0.65
    ) -> bool:
        """
        Returns True if candidate_question is too similar to any question in existing_questions.
        """
        cand_text = candidate_question.get("questionText", "")
        cand_norm = self.normalize_text(cand_text)
        cand_keywords = self.get_keywords(cand_text)
        cand_concepts = set(candidate_question.get("conceptIds", []))
        cand_answer = str(candidate_question.get("correctAnswer", "")).lower().strip()

        for eq in existing_questions:
            eq_text = eq.get("questionText", "")
            eq_norm = self.normalize_text(eq_text)

            # 1. Exact or near-exact normalized match
            if cand_norm == eq_norm:
                return True

            eq_keywords = self.get_keywords(eq_text)
            jaccard = self.compute_jaccard_similarity(cand_keywords, eq_keywords)

            eq_concepts = set(eq.get("conceptIds", []))
            concept_overlap = bool(cand_concepts and eq_concepts and cand_concepts.intersection(eq_concepts))

            eq_answer = str(eq.get("correctAnswer", "")).lower().strip()
            answer_overlap = (cand_answer == eq_answer and len(cand_answer) > 3)

            # High semantic similarity on same concept
            if jaccard >= similarity_threshold and concept_overlap:
                return True

            # Very high similarity regardless of concept
            if jaccard >= 0.85:
                return True

            # Moderate similarity with identical answer on same concept
            if jaccard >= 0.50 and concept_overlap and answer_overlap:
                return True

        return False
