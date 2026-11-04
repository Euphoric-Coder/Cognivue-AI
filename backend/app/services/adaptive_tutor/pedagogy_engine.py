"""
Pedagogy Engine: Deterministic pedagogical strategy generator.
Enforces:
- The backend determines the pedagogical strategy deterministically; the LLM does NOT decide it (Requirement #10)
- Adaptation bands: needs_attention, developing, proficient, strong (Requirement #7)
- Low confidence softens adaptation aggressiveness (Requirement #8)
- Unassessed concepts receive neutral tutoring (Requirement #9)
- Prerequisite-aware remediation (Requirements #15, #16, #17)
- Socratic mode safety: direct answer if student asks "just tell me" (Requirement #19)
- Graduated hints 1-4 (Requirements #33, #34)
- User instructions override style (Requirement #45)
"""

import logging
import re
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from app.services.adaptive_tutor.learner_context_service import AdaptiveTutorContext

logger = logging.getLogger(__name__)


@dataclass
class PedagogyStrategy:
    mode: str  # "scaffolded" | "guided" | "application" | "advanced" | "neutral" | "socratic" | "hint" | "quick_review" | "deep_dive"
    explanation_depth: str       # "detailed" | "standard" | "concise"
    language_complexity: str     # "simple" | "moderate" | "advanced"
    scaffolding_level: str       # "high" | "moderate" | "minimal" | "none"

    include_prerequisite_review: bool = False
    weak_prerequisite_name: Optional[str] = None

    include_worked_example: bool = False
    hint_level: int = 1
    ask_check_question: bool = False
    check_question_type: str = "none"  # "diagnostic" | "recall" | "application" | "conceptual" | "challenge" | "none"
    challenge_level: str = "medium"    # "low" | "medium" | "high"
    connect_related_concepts: bool = False

    socratic_guiding: bool = False
    why_this_approach: str = ""
    follow_up_suggestions: List[str] = field(default_factory=list)


class PedagogyEngine:
    SOCRATIC_ESCAPE_PATTERNS = [
        r"\bjust tell me\b",
        r"\bshow me the answer\b",
        r"\bexplain directly\b",
        r"\bgive me the answer\b",
        r"\bstop asking\b",
        r"\bwhat is the answer\b",
    ]

    USER_OVERRIDE_ADVANCED = [
        r"\bdon'?t simplify\b",
        r"\badvanced explanation\b",
        r"\bdeep dive\b",
        r"\btechnical details\b",
    ]

    USER_OVERRIDE_SIMPLE = [
        r"\bexplain simply\b",
        r"\blike i'?m five\b",
        r"\bsimplify it\b",
        r"\bstep by step\b",
        r"\bbreak it down\b",
    ]

    USER_OVERRIDE_BRIEF = [
        r"\bbriefly\b",
        r"\bshort answer\b",
        r"\bquick summary\b",
        r"\bin one sentence\b",
    ]

    def determine_strategy(
        self,
        context: AdaptiveTutorContext,
        tutor_mode: str = "adaptive",
        user_query: str = "",
        active_hint_level: Optional[int] = None,
    ) -> PedagogyStrategy:
        """
        Computes the deterministic pedagogy strategy.
        """
        mode = (tutor_mode or "adaptive").lower()
        query_norm = user_query.lower()

        # Check for Socratic escape
        is_socratic_escape = any(re.search(pat, query_norm) for pat in self.SOCRATIC_ESCAPE_PATTERNS)
        if mode == "socratic" and is_socratic_escape:
            logger.info("ADAPTIVE_TUTOR_SOCRATIC_SAFETY_TRIGGERED: user requested direct answer")
            mode = "explain"

        # Check for user stylistic overrides
        override_advanced = any(re.search(pat, query_norm) for pat in self.USER_OVERRIDE_ADVANCED)
        override_simple = any(re.search(pat, query_norm) for pat in self.USER_OVERRIDE_SIMPLE)
        override_brief = any(re.search(pat, query_norm) for pat in self.USER_OVERRIDE_BRIEF)

        # 1. Base Strategy from Learner State
        if context.is_unassessed or context.mastery_band == "not_assessed":
            strategy = self._build_unassessed_strategy(context)
        elif context.confidence in ("low", "insufficient"):
            strategy = self._build_low_confidence_strategy(context)
        elif context.mastery_band == "needs_attention":
            strategy = self._build_needs_attention_strategy(context)
        elif context.mastery_band == "developing":
            strategy = self._build_developing_strategy(context)
        elif context.mastery_band == "proficient":
            strategy = self._build_proficient_strategy(context)
        elif context.mastery_band == "strong":
            strategy = self._build_strong_strategy(context)
        else:
            strategy = self._build_unassessed_strategy(context)

        # 2. Prerequisite Intervention Logic
        if context.weak_prerequisites and len(context.weak_prerequisites) > 0:
            # If the student's mastery is not already strong, and weak prerequisite exists
            if context.mastery_band in ("needs_attention", "developing", "not_assessed"):
                strategy.include_prerequisite_review = True
                strategy.weak_prerequisite_name = context.weak_prerequisites[0].get("conceptName")
                logger.info(
                    f"ADAPTIVE_TUTOR_PREREQUISITE_INTERVENTION: concept={context.concept_name} prereq={strategy.weak_prerequisite_name}"
                )

        # 3. Apply Explicit Tutor Mode Modifications
        if mode == "socratic":
            strategy.mode = "socratic"
            strategy.socratic_guiding = True
            strategy.ask_check_question = True
            strategy.why_this_approach = "Socratic mode: Guiding your reasoning with focused questions grounded in course materials."
            strategy.follow_up_suggestions = [
                "Give me a hint",
                "Just tell me directly",
                "Explain step by step"
            ]

        elif mode == "hint":
            strategy.mode = "hint"
            current_hint = active_hint_level or (2 if context.mastery_band in ("needs_attention", "developing") else 1)
            # Escalate if query asks for another hint
            if "another hint" in query_norm or "next hint" in query_norm:
                current_hint = min(4, current_hint + 1)
            strategy.hint_level = current_hint
            strategy.explanation_depth = "concise"
            strategy.why_this_approach = f"Hint mode (Level {current_hint}): Providing graduated guidance without giving away the full solution."
            strategy.follow_up_suggestions = [
                "Give me another hint",
                "Just show me the full answer",
                "Explain the concept behind this"
            ]

        elif mode == "quick_review":
            strategy.mode = "quick_review"
            strategy.explanation_depth = "concise"
            strategy.include_worked_example = False
            strategy.ask_check_question = True
            strategy.check_question_type = "recall"
            strategy.why_this_approach = "Quick Review mode: Providing a concise grounded summary and key definitions."
            strategy.follow_up_suggestions = [
                "Deep dive on this concept",
                "Show an example from the source",
                "Try a practice question"
            ]

        elif mode == "deep_dive":
            strategy.mode = "deep_dive"
            strategy.explanation_depth = "detailed"
            strategy.connect_related_concepts = True
            strategy.why_this_approach = "Deep Dive mode: Exploring comprehensive multi-source evidence and conceptual connections."
            strategy.follow_up_suggestions = [
                "Summarize key takeaways",
                "Check my understanding with a question",
                "Show visual diagrams"
            ]

        elif mode == "explain":
            strategy.mode = "explain"
            strategy.ask_check_question = False
            strategy.why_this_approach = "Explain mode: Providing a direct, comprehensive grounded explanation."

        # 4. Apply User Stylistic Overrides
        if override_brief:
            strategy.explanation_depth = "concise"
        elif override_advanced:
            strategy.language_complexity = "advanced"
            strategy.scaffolding_level = "minimal"
        elif override_simple:
            strategy.language_complexity = "simple"
            strategy.scaffolding_level = "high"
            strategy.explanation_depth = "detailed"

        return strategy

    def _build_needs_attention_strategy(self, context: AdaptiveTutorContext) -> PedagogyStrategy:
        return PedagogyStrategy(
            mode="scaffolded",
            explanation_depth="detailed",
            language_complexity="simple",
            scaffolding_level="high",
            include_worked_example=True,
            hint_level=2,
            ask_check_question=True,
            check_question_type="diagnostic",
            challenge_level="low",
            connect_related_concepts=False,
            why_this_approach=(
                f"Adapted for developing foundation ({context.concept_name or 'concept'} · Needs Attention). "
                "Using simple, step-by-step scaffolding and minimal cognitive load."
            ),
            follow_up_suggestions=[
                "Review prerequisite step by step",
                "Walk through another example from notes",
                "Ask me a simple check question",
                "Give me a hint"
            ]
        )

    def _build_developing_strategy(self, context: AdaptiveTutorContext) -> PedagogyStrategy:
        return PedagogyStrategy(
            mode="guided",
            explanation_depth="standard",
            language_complexity="moderate",
            scaffolding_level="moderate",
            include_worked_example=True,
            hint_level=2,
            ask_check_question=True,
            check_question_type="application",
            challenge_level="medium",
            connect_related_concepts=False,
            why_this_approach=(
                f"Adapted for progress ({context.concept_name or 'concept'} · Developing). "
                "Connecting key steps to known principles with guided application."
            ),
            follow_up_suggestions=[
                "Show another worked example",
                "Give me a practice check question",
                "Clarify key distinction",
                "Deep dive into details"
            ]
        )

    def _build_proficient_strategy(self, context: AdaptiveTutorContext) -> PedagogyStrategy:
        return PedagogyStrategy(
            mode="application",
            explanation_depth="standard",
            language_complexity="advanced",
            scaffolding_level="minimal",
            include_worked_example=False,
            hint_level=1,
            ask_check_question=True,
            check_question_type="conceptual",
            challenge_level="medium_high",
            connect_related_concepts=True,
            why_this_approach=(
                f"Adapted for proficiency ({context.concept_name or 'concept'} · Proficient). "
                "Emphasizing application and conceptual nuance without repeating basic definitions."
            ),
            follow_up_suggestions=[
                "Connect to related concepts",
                "Try a harder challenge question",
                "Quick review summary",
                "Deep dive"
            ]
        )

    def _build_strong_strategy(self, context: AdaptiveTutorContext) -> PedagogyStrategy:
        return PedagogyStrategy(
            mode="advanced",
            explanation_depth="concise",
            language_complexity="advanced",
            scaffolding_level="none",
            include_worked_example=False,
            hint_level=1,
            ask_check_question=True,
            check_question_type="challenge",
            challenge_level="high",
            connect_related_concepts=True,
            why_this_approach=(
                f"Adapted for strong mastery ({context.concept_name or 'concept'} · Strong). "
                "Delivering concise advanced reasoning and cross-concept connections."
            ),
            follow_up_suggestions=[
                "Try an advanced challenge question",
                "Compare with related concepts",
                "Deep dive into edge cases",
                "Quick review"
            ]
        )

    def _build_low_confidence_strategy(self, context: AdaptiveTutorContext) -> PedagogyStrategy:
        return PedagogyStrategy(
            mode="neutral",
            explanation_depth="standard",
            language_complexity="moderate",
            scaffolding_level="moderate",
            include_worked_example=True,
            hint_level=1,
            ask_check_question=True,
            check_question_type="diagnostic",
            challenge_level="medium",
            connect_related_concepts=False,
            why_this_approach=(
                f"Balanced explanation for {context.concept_name or 'concept'} with a diagnostic check "
                "because assessment evidence is still building."
            ),
            follow_up_suggestions=[
                "Check my understanding with a question",
                "Show an example from the source",
                "Explain step by step"
            ]
        )

    def _build_unassessed_strategy(self, context: AdaptiveTutorContext) -> PedagogyStrategy:
        return PedagogyStrategy(
            mode="neutral",
            explanation_depth="standard",
            language_complexity="moderate",
            scaffolding_level="minimal",
            include_worked_example=True,
            hint_level=1,
            ask_check_question=False,
            check_question_type="none",
            challenge_level="medium",
            connect_related_concepts=False,
            why_this_approach=(
                f"Standard grounded explanation for {context.concept_name or 'this concept'} "
                "as no assessment history is recorded yet."
            ),
            follow_up_suggestions=[
                "Check my understanding with a question",
                "Show an example from course notes",
                "Explain step by step",
                "Deep dive"
            ]
        )
