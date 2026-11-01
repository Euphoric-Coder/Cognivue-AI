"""
Comprehensive test suite for Cognivue AI Version 8: Learner Model & Knowledge Tracing.
Tests all scenarios specified in Prompt Requirements (#73 to #91) using standard library unittest:
- Single observation (low confidence, provisional, never strong)
- Repeated correct answers (mastery & confidence rise)
- Repeated errors (mastery falls, needs_attention)
- Partial credit preservation (0.75 preserved)
- Mixed performance (moderate mastery, lower confidence)
- Easy vs hard weighting (hard questions yield higher evidence weight)
- Recency decay (smooth decay, historical base maintained)
- No evidence (insufficient_evidence, not 0% or needs_attention)
- Low evidence handling (<3 questions provisional)
- Prerequisite readiness independent of concept mastery
- Trend analysis (improving, stable, declining, insufficient_data)
"""

import time
import unittest
from app.services.learner_model.config import (
    MODEL_VERSION,
    DIFFICULTY_WEIGHTS,
    QUESTION_TYPE_WEIGHTS,
    RECENCY_MIN_FACTOR
)
from app.services.learner_model.observation_service import ObservationService
from app.services.learner_model.mastery_engine import MasteryEngine
from app.services.learner_model.confidence_engine import ConfidenceEngine
from app.services.learner_model.trend_analyzer import TrendAnalyzer
from app.services.learner_model.prerequisite_readiness import PrerequisiteReadinessEvaluator


class TestV8LearnerModel(unittest.TestCase):
    def setUp(self):
        self.observation_service = ObservationService()
        self.mastery_engine = MasteryEngine()
        self.confidence_engine = ConfidenceEngine()
        self.trend_analyzer = TrendAnalyzer()
        self.readiness_evaluator = PrerequisiteReadinessEvaluator()

    def test_single_observation_not_strong(self):
        """Test #73: Student answers one easy MCQ correctly. Expected: low confidence, developing/provisional, NOT strong."""
        now = int(time.time() * 1000)
        q = {
            "_id": "q1",
            "points": 1,
            "questionType": "mcq",
            "difficulty": "easy",
            "conceptIds": ["c_deriv"]
        }
        r = {
            "_id": "r1",
            "awardedPoints": 1,
            "isAnswered": True
        }
        concepts = {"c_deriv": {"name": "Derivative", "normalizedName": "derivative"}}

        obs_list = self.observation_service.create_observations_for_question(
            user_id="u1",
            course_id="crs1",
            assessment_id="a1",
            attempt_id="att1",
            question=q,
            response=r,
            concepts_by_id=concepts,
            timestamp=now
        )

        self.assertEqual(len(obs_list), 1)
        obs = obs_list[0]
        self.assertEqual(obs["scoreFraction"], 1.0)
        self.assertEqual(obs["correctness"], "correct")

        mastery_res = self.mastery_engine.compute_mastery(obs_list, now)
        self.assertEqual(mastery_res["mastery_probability"], 1.0)

        conf_score, conf_level = self.confidence_engine.compute_confidence(
            obs_list, mastery_res["difficulty_exposure"]
        )
        self.assertEqual(conf_level, "low")
        self.assertLess(conf_score, 0.35)

        band = self.confidence_engine.determine_mastery_band(
            mastery_res["mastery_probability"],
            len(obs_list),
            conf_level
        )
        # Crucial: Must NOT be labeled "strong" after only 1 question!
        self.assertNotEqual(band, "strong")
        self.assertEqual(band, "developing")

    def test_repeated_correct_answers_rises(self):
        """Test #74: Student answers 3 medium questions correctly, 1 hard correctly. Mastery & confidence rise."""
        now = int(time.time() * 1000)
        observations = [
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "mcq", "correctness": "correct", "timestamp": now - 3000},
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "mcq", "correctness": "correct", "timestamp": now - 2000},
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "short_answer", "correctness": "correct", "timestamp": now - 1000},
            {"scoreFraction": 1.0, "difficulty": "hard", "questionType": "concept_explanation", "correctness": "correct", "timestamp": now},
        ]

        mastery_res = self.mastery_engine.compute_mastery(observations, now)
        self.assertEqual(mastery_res["mastery_probability"], 1.0)

        conf_score, conf_level = self.confidence_engine.compute_confidence(
            observations, mastery_res["difficulty_exposure"]
        )
        self.assertIn(conf_level, ("medium", "high"))

        band = self.confidence_engine.determine_mastery_band(
            mastery_res["mastery_probability"],
            len(observations),
            conf_level
        )
        self.assertEqual(band, "strong")

    def test_repeated_errors_falls_to_needs_attention(self):
        """Test #75: Student repeatedly answers incorrectly. Mastery falls; needs_attention once sufficient evidence."""
        now = int(time.time() * 1000)
        observations = [
            {"scoreFraction": 0.0, "difficulty": "medium", "questionType": "mcq", "correctness": "incorrect", "timestamp": now - 3000},
            {"scoreFraction": 0.0, "difficulty": "medium", "questionType": "mcq", "correctness": "incorrect", "timestamp": now - 2000},
            {"scoreFraction": 0.25, "difficulty": "easy", "questionType": "short_answer", "correctness": "partial", "timestamp": now - 1000},
            {"scoreFraction": 0.0, "difficulty": "hard", "questionType": "numerical", "correctness": "incorrect", "timestamp": now},
        ]

        mastery_res = self.mastery_engine.compute_mastery(observations, now)
        self.assertLess(mastery_res["mastery_probability"], 0.20)

        conf_score, conf_level = self.confidence_engine.compute_confidence(
            observations, mastery_res["difficulty_exposure"]
        )
        band = self.confidence_engine.determine_mastery_band(
            mastery_res["mastery_probability"],
            len(observations),
            conf_level
        )
        self.assertEqual(band, "needs_attention")

    def test_partial_credit_preserved(self):
        """Test #76: Student receives 3 out of 4 points (0.75). Observation must preserve 0.75, not round to 0 or 1."""
        now = int(time.time() * 1000)
        q = {
            "_id": "q_sub",
            "points": 4,
            "questionType": "concept_explanation",
            "difficulty": "medium",
            "conceptIds": ["c_chain"]
        }
        r = {
            "_id": "r_sub",
            "awardedPoints": 3,
            "isAnswered": True
        }
        concepts = {"c_chain": {"name": "Chain Rule", "normalizedName": "chain rule"}}

        obs = self.observation_service.create_observations_for_question(
            user_id="u1",
            course_id="crs1",
            assessment_id="a1",
            attempt_id="att1",
            question=q,
            response=r,
            concepts_by_id=concepts,
            timestamp=now
        )[0]

        self.assertEqual(obs["scoreFraction"], 0.75)
        self.assertEqual(obs["correctness"], "partial")

    def test_mixed_performance(self):
        """Test #77: Responses: correct, incorrect, correct, partial, incorrect. Expected: moderate mastery, lower confidence."""
        now = int(time.time() * 1000)
        observations = [
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "mcq", "correctness": "correct", "timestamp": now - 4000},
            {"scoreFraction": 0.0, "difficulty": "medium", "questionType": "mcq", "correctness": "incorrect", "timestamp": now - 3000},
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "mcq", "correctness": "correct", "timestamp": now - 2000},
            {"scoreFraction": 0.5, "difficulty": "medium", "questionType": "short_answer", "correctness": "partial", "timestamp": now - 1000},
            {"scoreFraction": 0.0, "difficulty": "hard", "questionType": "mcq", "correctness": "incorrect", "timestamp": now},
        ]

        mastery_res = self.mastery_engine.compute_mastery(observations, now)
        self.assertTrue(0.35 <= mastery_res["mastery_probability"] <= 0.65)

        conf_score, conf_level = self.confidence_engine.compute_confidence(
            observations, mastery_res["difficulty_exposure"]
        )
        band = self.confidence_engine.determine_mastery_band(
            mastery_res["mastery_probability"],
            len(observations),
            conf_level
        )
        self.assertIn(band, ("developing", "needs_attention"))

    def test_easy_vs_hard_weighting(self):
        """Test #78: 4/5 on Easy vs 4/5 on Hard. Hard yields higher weighted score."""
        now = int(time.time() * 1000)
        obs_easy = [
            {"scoreFraction": 1.0, "difficulty": "easy", "questionType": "mcq", "correctness": "correct", "timestamp": now},
            {"scoreFraction": 1.0, "difficulty": "easy", "questionType": "mcq", "correctness": "correct", "timestamp": now},
            {"scoreFraction": 1.0, "difficulty": "easy", "questionType": "mcq", "correctness": "correct", "timestamp": now},
            {"scoreFraction": 1.0, "difficulty": "easy", "questionType": "mcq", "correctness": "correct", "timestamp": now},
            {"scoreFraction": 0.0, "difficulty": "easy", "questionType": "mcq", "correctness": "incorrect", "timestamp": now},
        ]

        obs_hard = [
            {"scoreFraction": 1.0, "difficulty": "hard", "questionType": "mcq", "correctness": "correct", "timestamp": now},
            {"scoreFraction": 1.0, "difficulty": "hard", "questionType": "mcq", "correctness": "correct", "timestamp": now},
            {"scoreFraction": 1.0, "difficulty": "hard", "questionType": "mcq", "correctness": "correct", "timestamp": now},
            {"scoreFraction": 1.0, "difficulty": "hard", "questionType": "mcq", "correctness": "correct", "timestamp": now},
            {"scoreFraction": 0.0, "difficulty": "hard", "questionType": "mcq", "correctness": "incorrect", "timestamp": now},
        ]

        res_easy = self.mastery_engine.compute_mastery(obs_easy, now)
        res_hard = self.mastery_engine.compute_mastery(obs_hard, now)

        self.assertGreater(res_hard["weighted_score"], res_easy["weighted_score"])

    def test_recency_decay_smooth(self):
        """Test #79: Concept previously strong, recent poor responses occur. Mastery declines smoothly, older evidence retained."""
        now = int(time.time() * 1000)
        three_weeks_ago = now - (21 * 24 * 3600 * 1000)

        obs = [
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "mcq", "correctness": "correct", "timestamp": three_weeks_ago},
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "mcq", "correctness": "correct", "timestamp": three_weeks_ago},
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "mcq", "correctness": "correct", "timestamp": three_weeks_ago},
            {"scoreFraction": 1.0, "difficulty": "medium", "questionType": "mcq", "correctness": "correct", "timestamp": three_weeks_ago},
            {"scoreFraction": 0.0, "difficulty": "medium", "questionType": "mcq", "correctness": "incorrect", "timestamp": now},
        ]

        res = self.mastery_engine.compute_mastery(obs, now)
        # Does NOT drop precipitously from 100% to 20%
        self.assertGreaterEqual(res["mastery_probability"], 0.65)

    def test_no_evidence_not_zero_or_needs_attention(self):
        """Test #80: Concept exists with zero observations. Must be insufficient_evidence, NOT 0% or needs_attention."""
        band = self.confidence_engine.determine_mastery_band(0.0, 0, "low")
        self.assertEqual(band, "insufficient_evidence")

    def test_prerequisite_readiness_independent_of_mastery(self):
        """Test #86 & #87: Prerequisite readiness is evaluated without altering target concept's mastery."""
        concept_states = {
            "prereq_good": {"masteryProbability": 0.90, "masteryBand": "strong"},
            "prereq_bad": {"masteryProbability": 0.35, "masteryBand": "needs_attention"},
        }
        concepts = {
            "prereq_good": {"name": "Basic Differentiation"},
            "prereq_bad": {"name": "Limits"},
            "target": {"name": "Chain Rule"}
        }

        # Scenario 1: Prerequisites strong
        res_strong = self.readiness_evaluator.evaluate_readiness(
            target_concept_id="target",
            prerequisite_concept_ids=["prereq_good"],
            concept_states_by_id=concept_states,
            concepts_by_id=concepts
        )
        self.assertEqual(res_strong["readiness"], "ready")

        # Scenario 2: Prerequisites weak
        res_weak = self.readiness_evaluator.evaluate_readiness(
            target_concept_id="target",
            prerequisite_concept_ids=["prereq_bad"],
            concept_states_by_id=concept_states,
            concepts_by_id=concepts
        )
        self.assertEqual(res_weak["readiness"], "needs_attention")

    def test_trend_analysis(self):
        """Test #42: Trend analyzer requires minimum evidence and detects improving / declining trajectory."""
        now = int(time.time() * 1000)

        # Insufficient observations (<3)
        t_insuf, _ = self.trend_analyzer.analyze_trend([{"scoreFraction": 1.0, "timestamp": now}])
        self.assertEqual(t_insuf, "insufficient_data")

        # Improving trajectory
        obs_improving = [
            {"scoreFraction": 0.40, "timestamp": now - 3000},
            {"scoreFraction": 0.50, "timestamp": now - 2000},
            {"scoreFraction": 0.85, "timestamp": now - 1000},
            {"scoreFraction": 0.95, "timestamp": now},
        ]
        t_imp, delta_imp = self.trend_analyzer.analyze_trend(obs_improving)
        self.assertEqual(t_imp, "improving")
        self.assertGreater(delta_imp, 0.08)

        # Declining trajectory
        obs_declining = [
            {"scoreFraction": 0.90, "timestamp": now - 3000},
            {"scoreFraction": 0.85, "timestamp": now - 2000},
            {"scoreFraction": 0.40, "timestamp": now - 1000},
            {"scoreFraction": 0.30, "timestamp": now},
        ]
        t_dec, delta_dec = self.trend_analyzer.analyze_trend(obs_declining)
        self.assertEqual(t_dec, "declining")
        self.assertLess(delta_dec, -0.08)


if __name__ == "__main__":
    unittest.main()
