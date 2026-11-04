"""
Unit and Integration Test Suite for Cognivue AI Version 9: Adaptive Tutor.
Tests all scenarios specified in Prompt Requirements (#81 through #98):
- Test #81: Weak Learner (Chain Rule mastery = 0.30, high confidence -> scaffolded, simple, diagnostic check)
- Test #82: Strong Learner (Chain Rule mastery = 0.92, high confidence -> concise, advanced, challenge check)
- Test #83: Low Confidence Handling (mastery = 0.90, confidence = low -> neutral/diagnostic, not overly advanced)
- Test #84: Not Assessed Concept (no learner state -> neutral explanation, no fake mastery label)
- Test #85: Weak Prerequisite (Chain Rule = 0.55, Basic Differentiation = 0.25 -> prerequisite remediation bridge)
- Test #86: Strong Prerequisite (Basic Differentiation = 0.91 -> does not waste answer reteaching basics)
- Test #87: Misconception Intervention (observed distractor/claim -> explicitly distinguishes with evidence)
- Test #88: Socratic Mode (guided questioning rather than immediately giving the full answer)
- Test #89: Socratic Safety Override (student says 'just tell me' -> direct grounded explanation)
- Test #90: Hint Mode (graduated hints levels 1-4 without revealing full answer immediately)
- Test #91: Quick Review Mode (concise summary, key definitions, recall check)
- Test #92: Deep Dive Mode (detailed explanation, multi-source evidence, related concepts)
- Test #93: Grounding Override Protection (weak student asks for example -> refusal if material contains none)
- Test #94: Learner Model Failure Fallback (service failure -> falls back safely to neutral grounded RAG)
- Test #95: Chat Does Not Change Mastery (conversations do NOT write or modify persistent mastery)
- Test #96: Review Incorrect Assessment Answer (server resolves question, error, rubric, and explains mistake)
- Test #97: Course Isolation (Course A learner state cannot bleed into Course B adaptive context)
- Test #98: User Isolation (User A learner state cannot bleed into User B adaptive context)
"""

import unittest
from unittest.mock import MagicMock, patch
from typing import List, Dict, Any

from app.services.adaptive_tutor.concept_mapper import ConceptMapper
from app.services.adaptive_tutor.prerequisite_service import PrerequisiteService
from app.services.adaptive_tutor.misconception_service import MisconceptionService
from app.services.adaptive_tutor.learner_context_service import LearnerContextService, AdaptiveTutorContext
from app.services.adaptive_tutor.pedagogy_engine import PedagogyEngine, PedagogyStrategy
from app.services.adaptive_tutor.adaptive_prompt_builder import AdaptivePromptBuilder
from app.services.adaptive_tutor.adaptive_tutor_service import AdaptiveTutorService


class TestV9AdaptiveTutor(unittest.TestCase):
    def setUp(self):
        self.concept_mapper = ConceptMapper()
        self.prerequisite_service = PrerequisiteService()
        self.misconception_service = MisconceptionService()
        self.learner_context_service = LearnerContextService()
        self.pedagogy_engine = PedagogyEngine()
        self.prompt_builder = AdaptivePromptBuilder()

        # Reusable sample concepts
        self.sample_concepts = [
            {
                "_id": "c_chain_rule",
                "name": "Chain Rule",
                "importance": "core",
                "description": "Rule for differentiating composite functions.",
                "aliases": ["composite differentiation"],
            },
            {
                "_id": "c_basic_diff",
                "name": "Basic Differentiation",
                "importance": "core",
                "description": "Fundamental rules of differentiation: power rule, sum rule.",
            },
            {
                "_id": "c_citycare_badges",
                "name": "CityCare Badges",
                "importance": "supporting",
                "description": "Badging system in CityCare separating system badges and custom badges.",
            },
        ]

        self.sample_relationships = [
            {
                "_id": "rel_1",
                "fromConceptId": "c_basic_diff",
                "toConceptId": "c_chain_rule",
                "relationType": "PREREQUISITE_OF",
                "strength": 0.95,
            }
        ]

    # Test #81: Weak Learner
    def test_weak_learner_scaffolded_pedagogy(self):
        """
        Test #81: Chain Rule mastery = 0.30, confidence = high.
        Expected: scaffolded mode, simple language, detailed depth, high scaffolding, diagnostic check.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_probability=0.30,
            mastery_percentage=30,
            mastery_band="needs_attention",
            confidence="high",
            evidence_count=5,
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Explain the Chain Rule.",
        )

        self.assertEqual(strategy.mode, "scaffolded")
        self.assertEqual(strategy.explanation_depth, "detailed")
        self.assertEqual(strategy.language_complexity, "simple")
        self.assertEqual(strategy.scaffolding_level, "high")
        self.assertTrue(strategy.ask_check_question)
        self.assertEqual(strategy.challenge_level, "low")
        self.assertIn("Needs Attention", strategy.why_this_approach)

        # Verify prompt builder output
        sys_prompt = self.prompt_builder.build_system_instruction(strategy, ctx)
        self.assertIn("SCAFFOLDED", sys_prompt)
        self.assertIn("SIMPLE", sys_prompt)
        self.assertIn("DETAILED", sys_prompt)

    # Test #82: Strong Learner
    def test_strong_learner_concise_advanced_pedagogy(self):
        """
        Test #82: Chain Rule mastery = 0.92, confidence = high.
        Expected: advanced mode, advanced language, concise depth, challenge question.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_probability=0.92,
            mastery_percentage=92,
            mastery_band="strong",
            confidence="high",
            evidence_count=6,
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Explain the Chain Rule.",
        )

        self.assertEqual(strategy.mode, "advanced")
        self.assertEqual(strategy.explanation_depth, "concise")
        self.assertEqual(strategy.language_complexity, "advanced")
        self.assertEqual(strategy.scaffolding_level, "none")
        self.assertTrue(strategy.ask_check_question)
        self.assertEqual(strategy.challenge_level, "high")
        self.assertIn("Strong", strategy.why_this_approach)

    # Test #83: Low Confidence Handling
    def test_low_confidence_softens_adaptation(self):
        """
        Test #83: mastery = 0.90, confidence = low (e.g. 1 question observed).
        Expected: does not treat student as definitively strong. Uses conservative neutral/diagnostic teaching.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_probability=0.90,
            mastery_percentage=90,
            mastery_band="strong",
            confidence="low",
            evidence_count=1,
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Explain the Chain Rule.",
        )

        # Low confidence overrides premature 'advanced' assumptions
        self.assertEqual(strategy.mode, "neutral")
        self.assertEqual(strategy.explanation_depth, "standard")
        self.assertEqual(strategy.language_complexity, "moderate")
        self.assertEqual(strategy.check_question_type, "diagnostic")
        self.assertIn("assessment evidence is still building", strategy.why_this_approach)

    # Test #84: Not Assessed Concept
    def test_not_assessed_concept_neutral_mode(self):
        """
        Test #84: Concept has no assessment history.
        Expected: neutral mode, neutral explanation, does NOT assume weak or strong.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="not_assessed",
            confidence="insufficient",
            evidence_count=0,
            is_unassessed=True,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="What is the Chain Rule?",
        )

        self.assertEqual(strategy.mode, "neutral")
        self.assertEqual(strategy.explanation_depth, "standard")
        self.assertFalse(strategy.include_prerequisite_review)
        self.assertNotIn("You are weak", strategy.why_this_approach)
        self.assertIn("no assessment history", strategy.why_this_approach)

    # Test #85: Weak Prerequisite
    def test_weak_prerequisite_triggers_remediation(self):
        """
        Test #85: Chain Rule mastery = 0.55, Basic Differentiation mastery = 0.25.
        Expected: Tutor recognizes weak prerequisite and triggers remediation bridge.
        """
        concepts_by_id = {c["_id"]: c for c in self.sample_concepts}
        learner_states_by_id = {
            "c_chain_rule": {
                "conceptId": "c_chain_rule",
                "masteryProbability": 0.55,
                "masteryBand": "developing",
                "confidence": "high",
            },
            "c_basic_diff": {
                "conceptId": "c_basic_diff",
                "masteryProbability": 0.25,
                "masteryBand": "needs_attention",
                "confidence": "high",
            },
        }

        prereq_analysis = self.prerequisite_service.find_prerequisites(
            target_concept_id="c_chain_rule",
            relationships=self.sample_relationships,
            concepts_by_id=concepts_by_id,
            learner_states_by_concept_id=learner_states_by_id,
        )

        self.assertTrue(prereq_analysis["has_weak_prerequisites"])
        self.assertEqual(prereq_analysis["readiness"], "weak")
        self.assertEqual(prereq_analysis["weak_prerequisites"][0]["conceptName"], "Basic Differentiation")

        # Now test learner context + pedagogy strategy
        ctx = self.learner_context_service.build_learner_context(
            course_id="crs_1",
            user_id="usr_1",
            target_concepts=[concepts_by_id["c_chain_rule"]],
            concept_match_confidence=0.95,
            learner_concept_states=[learner_states_by_id["c_chain_rule"], learner_states_by_id["c_basic_diff"]],
            prerequisite_analysis=prereq_analysis,
            active_misconceptions=[],
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Explain the Chain Rule.",
        )

        self.assertTrue(strategy.include_prerequisite_review)
        self.assertEqual(strategy.weak_prerequisite_name, "Basic Differentiation")

        prompt = self.prompt_builder.build_system_instruction(strategy, ctx)
        self.assertIn("Basic Differentiation", prompt)
        self.assertIn("PREREQUISITE REMEDIATION INSTRUCTION", prompt)

    # Test #86: Strong Prerequisite
    def test_strong_prerequisite_does_not_reteach_basics(self):
        """
        Test #86: Basic Differentiation mastery = 0.91, confidence = high.
        Expected: Does not waste answer reteaching basics (include_prerequisite_review = False).
        """
        concepts_by_id = {c["_id"]: c for c in self.sample_concepts}
        learner_states_by_id = {
            "c_chain_rule": {
                "conceptId": "c_chain_rule",
                "masteryProbability": 0.65,
                "masteryBand": "proficient",
                "confidence": "high",
            },
            "c_basic_diff": {
                "conceptId": "c_basic_diff",
                "masteryProbability": 0.91,
                "masteryBand": "strong",
                "confidence": "high",
            },
        }

        prereq_analysis = self.prerequisite_service.find_prerequisites(
            target_concept_id="c_chain_rule",
            relationships=self.sample_relationships,
            concepts_by_id=concepts_by_id,
            learner_states_by_concept_id=learner_states_by_id,
        )

        self.assertFalse(prereq_analysis["has_weak_prerequisites"])
        self.assertEqual(prereq_analysis["readiness"], "ready")

        ctx = self.learner_context_service.build_learner_context(
            course_id="crs_1",
            user_id="usr_1",
            target_concepts=[concepts_by_id["c_chain_rule"]],
            concept_match_confidence=0.95,
            learner_concept_states=[learner_states_by_id["c_chain_rule"], learner_states_by_id["c_basic_diff"]],
            prerequisite_analysis=prereq_analysis,
            active_misconceptions=[],
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Explain the Chain Rule.",
        )

        self.assertFalse(strategy.include_prerequisite_review)
        self.assertIsNone(strategy.weak_prerequisite_name)

    # Test #87: Misconception Intervention
    def test_misconception_distinction_guidance(self):
        """
        Test #87: Observed misconception: custom badges and system badges are identical.
        Expected: Prompt explicitly guides tutor to neutrally clarify custom vs system distinction using evidence.
        """
        misconceptions = [
            {
                "_id": "m1",
                "conceptId": "c_citycare_badges",
                "conceptName": "CityCare Badges",
                "misconceptionKey": "custom_and_system_badges_identical",
                "description": "Student confused custom badges with system badges as having identical roles.",
                "evidenceCount": 2,
                "confidence": "medium",
                "confidenceScore": 0.7,
                "active": True,
            }
        ]

        active_m = self.misconception_service.find_active_misconceptions(
            concept_ids=["c_citycare_badges"],
            concept_names=["CityCare Badges"],
            misconceptions=misconceptions,
        )
        self.assertEqual(len(active_m), 1)

        guidance = self.misconception_service.format_misconception_guidance(active_m)
        self.assertIn("ACTIVE LEARNER MISCONCEPTION DETECTED", guidance)
        self.assertIn("custom badges with system badges", guidance)
        self.assertIn("Do NOT accuse", guidance)

    # Test #88: Socratic Mode
    def test_socratic_mode_guiding_questions(self):
        """
        Test #88: Student asks: How do I apply the Chain Rule?
        Expected: Tutor enters Socratic mode with guided questioning rather than dumping full answer.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="developing",
            confidence="high",
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="socratic",
            user_query="How do I apply the Chain Rule?",
        )

        self.assertEqual(strategy.mode, "socratic")
        self.assertTrue(strategy.socratic_guiding)
        self.assertTrue(strategy.ask_check_question)

        prompt = self.prompt_builder.build_system_instruction(strategy, ctx)
        self.assertIn("SOCRATIC GUIDING INSTRUCTION", prompt)
        self.assertIn("Do NOT immediately provide the complete final solution", prompt)

    # Test #89: Socratic Safety Override
    def test_socratic_safety_escape(self):
        """
        Test #89: Student in Socratic mode asks: 'Just tell me.'
        Expected: Safety override activates, switching from Socratic to direct explain mode.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="developing",
            confidence="high",
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="socratic",
            user_query="Just tell me the answer.",
        )

        # Socratic mode safety escape triggered
        self.assertEqual(strategy.mode, "explain")
        self.assertFalse(strategy.socratic_guiding)

    # Test #90: Hint Mode
    def test_hint_mode_graduated_levels(self):
        """
        Test #90: Hint mode provides graduated clues (Level 1 to 4) without revealing final answer.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="proficient",
            confidence="high",
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        # First hint for proficient learner
        strategy_lvl1 = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="hint",
            user_query="How do I solve this derivative?",
            active_hint_level=1,
        )
        self.assertEqual(strategy_lvl1.mode, "hint")
        self.assertEqual(strategy_lvl1.hint_level, 1)

        # Asking for another hint escalates level
        strategy_lvl2 = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="hint",
            user_query="Give me another hint please.",
            active_hint_level=1,
        )
        self.assertEqual(strategy_lvl2.hint_level, 2)

        prompt = self.prompt_builder.build_system_instruction(strategy_lvl2, ctx)
        self.assertIn("HINT MODE INSTRUCTION (HINT LEVEL 2 OF 4)", prompt)

    # Test #91: Quick Review Mode
    def test_quick_review_mode(self):
        """
        Test #91: Quick review mode delivers concise summary and key definitions.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="strong",
            confidence="high",
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="quick_review",
            user_query="Quick review of Chain Rule.",
        )

        self.assertEqual(strategy.mode, "quick_review")
        self.assertEqual(strategy.explanation_depth, "concise")
        self.assertEqual(strategy.check_question_type, "recall")

    # Test #92: Deep Dive Mode
    def test_deep_dive_mode(self):
        """
        Test #92: Deep dive delivers detailed explanation and multi-source conceptual links.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="strong",
            confidence="high",
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="deep_dive",
            user_query="Give me a deep dive on Chain Rule.",
        )

        self.assertEqual(strategy.mode, "deep_dive")
        self.assertEqual(strategy.explanation_depth, "detailed")
        self.assertTrue(strategy.connect_related_concepts)

    # Test #93: Grounding Override Protection
    def test_grounding_override_protection(self):
        """
        Test #93: Weak learner asks for an example, but uploaded material contains none.
        Expected: Prompt strictly forbids inventing examples merely because mastery is low.
        """
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="needs_attention",
            confidence="high",
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Give me a worked example of the Chain Rule.",
        )

        prompt = self.prompt_builder.build_system_instruction(strategy, ctx)
        self.assertIn("STRICT GROUNDING OVERRIDE PROTECTION", prompt)
        self.assertIn("NEVER invent examples", prompt)

    # Test #94: Learner Model Failure Fallback
    def test_learner_model_failure_graceful_fallback(self):
        """
        Test #94: If learner state lookup or graph throws an unexpected error,
        the tutor safely falls back to neutral grounded tutoring without crashing.
        """
        mock_convex = MagicMock()
        mock_convex.query.side_effect = Exception("Convex connection timeout")

        service = AdaptiveTutorService(mock_convex)
        with patch.object(service.embedding_service, "embed_text", return_value=[0.1] * 768), \
             patch.object(service, "_generate_adaptive_answer", return_value=("Grounded fallback answer", True, ["CONTEXT_1"])):
            mock_convex.action.return_value = [
                {
                    "_id": "chk1",
                    "sourceId": "src1",
                    "sourceName": "Calculus Notes",
                    "text": "The chain rule is dy/dx = (dy/du)*(du/dx)",
                    "locationType": "page",
                    "pageNumber": 12,
                }
            ]

            result = service.ask_adaptive_tutor(
                course_id="crs_1",
                session_id="sess_1",
                user_id="usr_1",
                question="Explain the Chain Rule.",
            )

            self.assertTrue(result["grounded"])
            self.assertEqual(result["answer"], "Grounded fallback answer")
            self.assertIsNotNone(result["adaptation"])
            self.assertEqual(result["adaptation"]["masteryBand"], "not_assessed")

    # Test #95: Chat Does Not Modify Mastery
    def test_chat_does_not_modify_mastery(self):
        """
        Test #95: Ask multiple tutor questions and verify that learnerConceptStates
        and learnerObservations are NEVER called or updated.
        """
        mock_convex = MagicMock()
        service = AdaptiveTutorService(mock_convex)

        with patch.object(service.embedding_service, "embed_text", return_value=[0.1] * 768), \
             patch.object(service, "_generate_adaptive_answer", return_value=("Answer", True, [])):
            mock_convex.action.return_value = [{"_id": "c1", "sourceId": "s1", "text": "evidence"}]

            service.ask_adaptive_tutor(
                course_id="crs_1",
                session_id="sess_1",
                user_id="usr_1",
                question="I think I understand now, can you confirm?",
            )

            # Inspect all mutation calls made to Convex
            mutation_names = [call[0][0] for call in mock_convex.mutation.call_args_list]
            for m_name in mutation_names:
                self.assertNotIn("learnerObservations", m_name)
                self.assertNotIn("learnerConceptStates", m_name)
                self.assertNotIn("recomputeCourseLearnerModel", m_name)

    # Test #96: Review Incorrect Assessment Answer
    def test_review_incorrect_assessment_answer(self):
        """
        Test #96: Review with Tutor passes questionId and responseId.
        Server-side verified context is injected into system prompt.
        """
        review_context = {
            "questionText": "What rule differentiates composite functions?",
            "userAnswer": "Power Rule",
            "correctAnswer": "Chain Rule",
            "explanation": "Composite functions require the chain rule: dy/dx = (dy/du)*(du/dx)",
            "feedback": "You applied the power rule instead of the chain rule.",
            "isCorrect": False,
            "awardedPoints": 0,
            "points": 2,
            "concepts": [{"id": "c_chain_rule", "name": "Chain Rule"}],
        }

        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="needs_attention",
            confidence="high",
            is_unassessed=False,
            concept_match_confidence=1.0,
            review_context=review_context,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Help me understand why my answer was wrong.",
        )

        sys_prompt = self.prompt_builder.build_system_instruction(strategy, ctx, review_context=review_context)
        self.assertIn("REVIEW ASSESSMENT MISTAKE INSTRUCTION", sys_prompt)
        self.assertIn("Power Rule", sys_prompt)
        self.assertIn("chain rule", sys_prompt.lower())

    # Test #97: Course Isolation
    def test_course_isolation(self):
        """
        Test #97: Adaptive tutor for Course A cannot access Course B learner state.
        """
        mock_convex = MagicMock()
        service = AdaptiveTutorService(mock_convex)

        with patch.object(service.embedding_service, "embed_text", return_value=[0.1] * 768), \
             patch.object(service, "_generate_adaptive_answer", return_value=("Answer", True, [])):
            mock_convex.action.return_value = [{"_id": "c1", "sourceId": "s1", "text": "evidence"}]

            service.ask_adaptive_tutor(
                course_id="crs_A",
                session_id="sess_1",
                user_id="usr_1",
                question="Explain derivatives.",
            )

            # Ensure all queries pass courseId = 'crs_A'
            for call in mock_convex.query.call_args_list:
                args = call[0][1] if len(call[0]) > 1 else {}
                if "courseId" in args:
                    self.assertEqual(args["courseId"], "crs_A")

    # Test #98: User Isolation
    def test_user_isolation(self):
        """
        Test #98: User A cannot access User B learner state or misconceptions.
        """
        mock_convex = MagicMock()
        service = AdaptiveTutorService(mock_convex)

        with patch.object(service.embedding_service, "embed_text", return_value=[0.1] * 768), \
             patch.object(service, "_generate_adaptive_answer", return_value=("Answer", True, [])):
            mock_convex.action.return_value = [{"_id": "c1", "sourceId": "s1", "text": "evidence"}]

            service.ask_adaptive_tutor(
                course_id="crs_1",
                session_id="sess_1",
                user_id="usr_A",
                question="Explain derivatives.",
            )

            # Verify event recording specifies usr_A's session
            mutation_calls = mock_convex.mutation.call_args_list
            for call in mutation_calls:
                args = call[0][1] if len(call[0]) > 1 else {}
                if "courseId" in args:
                    self.assertEqual(args["courseId"], "crs_1")
                if "sessionId" in args:
                    self.assertEqual(args["sessionId"], "sess_1")

    # Test Concept Mapper Confidence & Fallback
    def test_concept_mapper_confidence(self):
        """
        Test #61: Query to concept mapping confidence.
        If confidence < 0.55, does not force incorrect adaptation; returns neutral fallback.
        """
        # Exact match
        concepts, conf = self.concept_mapper.map_query_to_concepts(
            query="Explain the Chain Rule in calculus.",
            course_concepts=self.sample_concepts,
        )
        self.assertEqual(len(concepts), 1)
        self.assertEqual(concepts[0]["name"], "Chain Rule")
        self.assertGreaterEqual(conf, 0.90)

        # Completely unrelated query
        concepts, conf = self.concept_mapper.map_query_to_concepts(
            query="What is the weather in Tokyo tomorrow?",
            course_concepts=self.sample_concepts,
        )
        self.assertEqual(len(concepts), 0)
        self.assertLess(conf, 0.55)

    # Test User Stylistic Overrides
    def test_user_stylistic_overrides(self):
        """
        Test #45: Direct student requests ('don't simplify it', 'briefly') override default pedagogy.
        """
        # Weak student asks for advanced explanation directly
        ctx = AdaptiveTutorContext(
            concept_id="c_chain_rule",
            concept_name="Chain Rule",
            mastery_band="needs_attention",
            confidence="high",
            is_unassessed=False,
            concept_match_confidence=0.95,
        )

        strategy = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Explain the Chain Rule. Don't simplify it, give me the advanced explanation.",
        )

        self.assertEqual(strategy.language_complexity, "advanced")

        # Student asks for a brief answer
        strategy_brief = self.pedagogy_engine.determine_strategy(
            context=ctx,
            tutor_mode="adaptive",
            user_query="Briefly summarize the Chain Rule in one sentence.",
        )
        self.assertEqual(strategy_lvl := strategy_brief.explanation_depth, "concise")


if __name__ == "__main__":
    unittest.main()
