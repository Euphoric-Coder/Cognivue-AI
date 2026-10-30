import re
from typing import Dict, Any, List

class DifficultyClassifier:
    """
    Evaluates and validates question complexity based on structural definitions:
    - Easy: direct recall, definitions, single concept, single evidence item
    - Medium: application, comparison, diagram/table interpretation, relationship between concepts
    - Hard: multi-step reasoning, multiple concepts, evidence synthesis, prerequisite chains
    """

    EASY_INDICATORS = [
        r"\bwhat is\b", r"\bdefine\b", r"\bwhich of the following is\b",
        r"\bidentify\b", r"\bstate the\b", r"\baccording to\b", r"\bterm\b",
        r"\bname the\b", r"\btrue or false\b"
    ]

    MEDIUM_INDICATORS = [
        r"\bhow does\b", r"\bwhy is\b", r"\bapply\b", r"\bcompare\b",
        r"\bdistinguish\b", r"\bconnect\b", r"\brelates to\b", r"\bdiagram\b",
        r"\btable\b", r"\bwhen should\b", r"\bexample of\b"
    ]

    HARD_INDICATORS = [
        r"\bsynthesize\b", r"\bevaluate\b", r"\bconsequence\b", r"\bmulti-step\b",
        r"\bprerequisite\b", r"\btradeoff\b", r"\bwhat would happen if\b",
        r"\banalyze the relationship\b", r"\bdetermine the net\b", r"\bhow do .+ and .+ both affect\b"
    ]

    def classify(
        self,
        question_text: str,
        concept_count: int = 1,
        evidence_count: int = 1,
        question_type: str = "mcq",
        has_visual: bool = False,
        has_relationship: bool = False
    ) -> str:
        text_lower = question_text.lower()

        # Score structural weights
        hard_score = 0
        med_score = 0
        easy_score = 0

        for pat in self.HARD_INDICATORS:
            if re.search(pat, text_lower):
                hard_score += 2

        for pat in self.MEDIUM_INDICATORS:
            if re.search(pat, text_lower):
                med_score += 1.5

        for pat in self.EASY_INDICATORS:
            if re.search(pat, text_lower):
                easy_score += 1.5

        if concept_count > 1:
            hard_score += 1.5
            med_score += 1
        if evidence_count > 1:
            hard_score += 1.5
        if has_relationship:
            med_score += 1
            hard_score += 1
        if has_visual:
            med_score += 1

        if question_type in ["concept_explanation"]:
            hard_score += 1
            med_score += 1

        if hard_score >= 3.0:
            return "hard"
        elif med_score >= 2.0 or hard_score >= 1.5:
            return "medium"
        else:
            return "easy"

    def matches_target(self, detected_difficulty: str, target_difficulty: str) -> bool:
        if target_difficulty == "mixed":
            return True
        return detected_difficulty == target_difficulty
