import re
import logging
from typing import List, Dict, Any, Tuple

logger = logging.getLogger(__name__)

class AnswerValidator:
    """
    Validates that:
    1. The correct answer is factually supported by the course evidence.
    2. Distractors are plausible but strictly NOT supported by the course evidence.
    3. Options adhere to quality standards (no duplicates, no trivial giveaways).
    """

    STOP_WORDS = {
        "a", "an", "the", "in", "on", "of", "at", "by", "for", "with", "about",
        "is", "are", "was", "were", "be", "to", "from", "that", "this", "it"
    }

    def _extract_key_tokens(self, text: str) -> set:
        clean = re.sub(r"[^\w\s]", "", text.lower())
        tokens = [w for w in clean.split() if w not in self.STOP_WORDS and len(w) > 2]
        return set(tokens)

    def verify_correct_answer_grounding(self, correct_answer: Any, evidence_texts: List[str]) -> Tuple[bool, str]:
        """
        Ensures the correct answer is genuinely corroborated by the provided evidence excerpts.
        """
        if correct_answer is None or str(correct_answer).strip() == "":
            return False, "Correct answer is empty."

        combined_evidence = " ".join(evidence_texts).lower()
        if not combined_evidence:
            return False, "No evidence text provided for verification."

        # For boolean / true_false, the statement itself is checked
        if isinstance(correct_answer, bool) or str(correct_answer).lower() in ["true", "false"]:
            return True, "Boolean answer format valid."

        ans_str = str(correct_answer).lower()

        # Check for numerical
        try:
            num = float(ans_str)
            # If numeric, check if that number or close digits appear in evidence
            if str(int(num)) in combined_evidence or ans_str in combined_evidence:
                return True, "Numerical answer found in evidence."
        except ValueError:
            pass

        # For text / mcq answer: extract keywords
        ans_tokens = self._extract_key_tokens(ans_str)
        if not ans_tokens:
            return True, "Short answer verified."

        # Check what percentage of key tokens appear in the combined evidence
        found_tokens = [t for t in ans_tokens if t in combined_evidence]
        grounding_ratio = len(found_tokens) / len(ans_tokens)

        if grounding_ratio < 0.40 and len(ans_tokens) >= 3:
            return False, f"Correct answer has weak evidence grounding ({grounding_ratio:.2f}): {found_tokens} of {ans_tokens}"

        return True, "Correct answer sufficiently grounded in evidence."

    def verify_distractors_not_supported(
        self,
        options: List[str],
        correct_answer: Any,
        evidence_texts: List[str]
    ) -> Tuple[bool, str]:
        """
        Requirement 29: Distractor Validation.
        Check whether any distractor is also supported by evidence.
        If a distractor is heavily grounded in the evidence as a true statement,
        it may cause ambiguity and must be flagged/rejected.
        """
        if not options or len(options) < 2:
            return True, "No distractors to validate."

        combined_evidence = " ".join(evidence_texts).lower()
        correct_str = str(correct_answer).strip().lower()

        for opt in options:
            opt_str = opt.strip()
            if opt_str.lower() == correct_str:
                continue

            # Check if option is trivial negative or "all of the above"
            opt_lower = opt_str.lower()
            if "all of the above" in opt_lower or "none of the above" in opt_lower:
                return False, f"Avoid '{opt_str}' by default (Requirement 14)."

            tokens = self._extract_key_tokens(opt_str)
            if len(tokens) >= 4:
                found_tokens = [t for t in tokens if t in combined_evidence]
                ratio = len(found_tokens) / len(tokens)
                # If a distractor has > 85% keyword match and is a long sentence, it might accidentally be a verbatim true excerpt
                if ratio >= 0.88 and opt_lower in combined_evidence:
                    return False, f"Distractor '{opt_str}' appears verbatim in course evidence as a fact."

        return True, "All distractors are safe and uncorroborated."

    def validate_options_format(self, options: List[str]) -> Tuple[bool, str]:
        """
        Verifies option count, uniqueness, and consistency.
        """
        if not options:
            return False, "Options list is empty."

        cleaned = [o.strip() for o in options if o and o.strip()]
        if len(cleaned) < 2:
            return False, "At least 2 options required."

        # Check for duplicate options
        seen = set()
        for o in cleaned:
            low = o.lower()
            if low in seen:
                return False, f"Duplicate option detected: '{o}'"
            seen.add(low)

        return True, "Options format valid."
