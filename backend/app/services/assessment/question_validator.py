import logging
from typing import Dict, Any, List, Tuple
from app.services.assessment.answer_validator import AnswerValidator
from app.services.assessment.difficulty_classifier import DifficultyClassifier

logger = logging.getLogger(__name__)

class QuestionValidator:
    """
    Second-pass question validation pipeline (Requirement 27-31).
    Evaluates:
    - Grounding against selected evidence
    - Correct answer factual corroboration
    - Distractor non-overlap with evidence facts
    - Ambiguity and option quality
    - Structural difficulty
    - Quality scoring and minimum thresholding
    """

    def __init__(self):
        self.answer_validator = AnswerValidator()
        self.difficulty_classifier = DifficultyClassifier()

    def validate(
        self,
        question: Dict[str, Any],
        evidence_items: List[Dict[str, Any]],
        target_difficulty: str = "mixed"
    ) -> Tuple[bool, str, float]:
        """
        Returns (is_valid, reason, quality_score).
        """
        q_text = question.get("questionText", "").strip()
        q_type = question.get("questionType", "mcq")
        correct_ans = question.get("correctAnswer")
        options = question.get("options", [])
        explanation = question.get("explanation", "").strip()

        # 1. Basic structural checks
        if not q_text or len(q_text) < 12:
            return False, "Question text is too short or empty.", 0.0

        if not explanation or len(explanation) < 10:
            return False, "Explanation is missing or insufficient.", 0.0

        if not evidence_items:
            return False, "No evidence items provided for question.", 0.0

        evidence_texts = [ev.get("excerpt", "") for ev in evidence_items]

        # 2. MCQ / Multiple Select specific validation
        if q_type in ["mcq", "multiple_select"]:
            opt_valid, opt_reason = self.answer_validator.validate_options_format(options)
            if not opt_valid:
                return False, f"Invalid options format: {opt_reason}", 0.2

            if q_type == "mcq":
                if len(options) != 4:
                    return False, f"MCQ requires exactly 4 options, found {len(options)}", 0.3
                # Verify correct answer matches one of the options
                if str(correct_ans).strip() not in [o.strip() for o in options]:
                    return False, f"Correct answer '{correct_ans}' is not in options list.", 0.3

                # Distractor validation (Requirement 29)
                dist_valid, dist_reason = self.answer_validator.verify_distractors_not_supported(
                    options, correct_ans, evidence_texts
                )
                if not dist_valid:
                    return False, f"Distractor validation failed: {dist_reason}", 0.4

        # 3. Correct answer grounding check (Requirement 28)
        ans_grounded, ans_reason = self.answer_validator.verify_correct_answer_grounding(
            correct_ans, evidence_texts
        )
        if not ans_grounded:
            return False, f"Correct answer grounding failed: {ans_reason}", 0.35

        # 4. Difficulty validation (Requirement 21)
        detected_diff = self.difficulty_classifier.classify(
            question_text=q_text,
            concept_count=len(question.get("conceptIds", [])),
            evidence_count=len(evidence_items),
            question_type=q_type,
            has_visual=bool(question.get("sourceVisualId") or question.get("sourceVisualUrl")),
            has_relationship=len(question.get("conceptIds", [])) > 1
        )

        diff_matched = self.difficulty_classifier.matches_target(detected_diff, target_difficulty)
        if not diff_matched and target_difficulty != "mixed":
            # If target was specific (e.g. 'hard') but question is 'easy', reject
            if target_difficulty == "hard" and detected_diff == "easy":
                return False, f"Difficulty mismatch: target is {target_difficulty}, detected {detected_diff}", 0.5
            elif target_difficulty == "easy" and detected_diff == "hard":
                return False, f"Difficulty mismatch: target is {target_difficulty}, detected {detected_diff}", 0.5

        # 5. Calculate quality score (Requirement 31)
        quality_score = 0.50

        # Grounding bonus
        if ans_grounded:
            quality_score += 0.20

        # Rich explanation bonus
        if len(explanation) > 40:
            quality_score += 0.10

        # Evidence depth bonus
        if len(evidence_items) >= 2 or any(ev.get("evidenceType") in ["visual", "video_transcript"] for ev in evidence_items):
            quality_score += 0.10

        # Options clean bonus
        if q_type == "mcq" and len(options) == 4:
            quality_score += 0.10

        quality_score = min(round(quality_score, 2), 1.0)

        if quality_score < 0.70:
            return False, f"Quality score {quality_score:.2f} below threshold (0.70).", quality_score

        return True, "Question successfully validated.", quality_score
