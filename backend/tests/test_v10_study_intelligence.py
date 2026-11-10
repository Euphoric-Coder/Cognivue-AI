"""
Comprehensive Unit and Integration Test Suite for Cognivue AI Version 10: Personal Study Intelligence.
Tests all scenarios specified in Prompt Requirements (#75 through #95):
- Test #75: Weak Concept (Chain Rule mastery = 0.35, high confidence -> high-priority recommendation)
- Test #76: Strong Concept (Derivative mastery = 0.92, high confidence, recent -> low study priority)
- Test #77: Strong but Due (Derivative = 0.92, last review = old -> Spaced Review, NOT Needs Attention)
- Test #78: Unassessed Core Concept (zero evidence -> Not Assessed, diagnostic/coverage recommendation, NOT weak)
- Test #79: Prerequisite Blocker (Chain Rule = 0.55, Basic Diff = 0.28 -> Basic Diff prioritized before Chain Rule)
- Test #80: Active Misconception (High-confidence misconception -> targeted remediation recommendation)
- Test #81: Source Recommendation (Weak concept with PDF, PPTX, video, visual -> best multimodal evidence recommended)
- Test #82: Daily 30-Min Plan (Generate 30 minutes -> activities fit within time budget)
- Test #83: Exam Plan (Exam in 14 days, daily 45 min -> core concepts appear earlier, fits days/time)
- Test #84: Exam Plan with Low Coverage (Coverage = 30% -> balances diagnostic coverage + weak remediation)
- Test #85: Completed Item (Complete source review -> marked complete, persistent mastery UNCHANGED)
- Test #86: Completed Quiz (Complete quiz -> updates mastery and triggers recommendation recompute)
- Test #87: Missed Item (Miss scheduled item, rebuild plan -> rescheduled without duplicates)
- Test #88: Source Delete (Delete recommended source -> switches to alternate evidence)
- Test #89: Mastery Improvement (Weak concept improves significantly -> priority falls)
- Test #90: Mastery Decline (Performance worsens -> priority rises)
- Test #91: New Learner (Zero assessment history -> diagnostic recommendation, no fake weak topics)
- Test #92: Study Tutor Query (Ask 'What should I study next?' -> returns actual backend recommendations)
- Test #93: Exam Tutor Query (Ask 'What should I focus on before my exam?' -> uses exam plan data)
- Test #94: User Isolation (User A data completely isolated from User B)
- Test #95: Course Isolation (Course A study data cannot bleed into Course B)
"""

import unittest
from unittest.mock import MagicMock, patch
from typing import List, Dict, Any
import time

from app.services.study_intelligence.priority_engine import PriorityEngine
from app.services.study_intelligence.source_recommender import SourceRecommender
from app.services.study_intelligence.assessment_recommender import AssessmentRecommender
from app.services.study_intelligence.spaced_review_engine import SpacedReviewEngine
from app.services.study_intelligence.study_plan_builder import StudyPlanBuilder
from app.services.study_intelligence.exam_plan_builder import ExamPlanBuilder
from app.services.study_intelligence.recommendation_engine import RecommendationEngine
from app.services.study_intelligence.study_intelligence_service import StudyIntelligenceService
from app.services.adaptive_tutor.adaptive_tutor_service import AdaptiveTutorService


class TestV10StudyIntelligence(unittest.TestCase):
    def setUp(self):
        self.priority_engine = PriorityEngine()
        self.source_recommender = SourceRecommender()
        self.assessment_recommender = AssessmentRecommender()
        self.spaced_review_engine = SpacedReviewEngine()
        self.study_plan_builder = StudyPlanBuilder()
        self.exam_plan_builder = ExamPlanBuilder()
        self.recommendation_engine = RecommendationEngine()
        self.study_service = StudyIntelligenceService(convex_client=None)

        self.concept_chain_rule = {
            "_id": "c_chain_rule",
            "name": "Chain Rule",
            "normalizedName": "chain_rule",
            "importance": "core",
            "type": "concept",
        }
        self.concept_basic_diff = {
            "_id": "c_basic_diff",
            "name": "Basic Differentiation",
            "normalizedName": "basic_differentiation",
            "importance": "core",
            "type": "concept",
        }
        self.concept_derivative = {
            "_id": "c_derivative",
            "name": "Derivative",
            "normalizedName": "derivative",
            "importance": "core",
            "type": "concept",
        }

    # =========================================================================
    # Test #75: Weak Concept
    # =========================================================================
    def test_75_weak_concept_high_priority(self):
        """
        Set: Chain Rule mastery = 0.35, confidence = high.
        Expected: high or critical priority recommendation with LOW_MASTERY reason code.
        """
        learner_state = {
            "conceptId": "c_chain_rule",
            "masteryProbability": 0.35,
            "masteryBand": "needs_attention",
            "confidence": "high",
            "evidenceCount": 4,
            "incorrectAttempts": 2,
        }

        res = self.priority_engine.calculate_priority(
            concept=self.concept_chain_rule,
            learner_state=learner_state,
        )

        self.assertIn(res["priorityBand"], ("high", "critical"))
        self.assertGreaterEqual(res["priorityScore"], 50.0)
        self.assertIn("LOW_MASTERY", res["reasonCodes"])
        self.assertIn("CONFIRMED_DEFICIENCY", res["reasonCodes"])
        self.assertIn("Mastery at 35%", res["reasonSummary"])

    # =========================================================================
    # Test #76: Strong Concept
    # =========================================================================
    def test_76_strong_concept_low_priority(self):
        """
        Set: Derivative mastery = 0.92, confidence = high, recently assessed.
        Expected: low study priority.
        """
        learner_state = {
            "conceptId": "c_derivative",
            "masteryProbability": 0.92,
            "masteryBand": "strong",
            "confidence": "high",
            "evidenceCount": 5,
            "incorrectAttempts": 0,
            "lastObservedAt": int(time.time() * 1000) - (1 * 86400000), # 1 day ago
        }

        res = self.priority_engine.calculate_priority(
            concept=self.concept_derivative,
            learner_state=learner_state,
            review_state={"nextReviewAt": int(time.time() * 1000) + (13 * 86400000)},
        )

        self.assertEqual(res["priorityBand"], "low")
        self.assertLess(res["priorityScore"], 25.0)

    # =========================================================================
    # Test #77: Strong but Due
    # =========================================================================
    def test_77_strong_concept_due_for_spaced_review(self):
        """
        Set: Derivative = 0.92, last review = old.
        Expected: Spaced Review, NOT Needs Attention.
        """
        now = int(time.time() * 1000)
        learner_state = {
            "conceptId": "c_derivative",
            "masteryProbability": 0.92,
            "masteryBand": "strong",
            "confidence": "high",
            "evidenceCount": 5,
            "lastObservedAt": now - (20 * 86400000), # 20 days ago
        }
        review_state = {
            "conceptId": "c_derivative",
            "nextReviewAt": now - (5 * 86400000), # Overdue by 5 days
            "reviewIntervalDays": 14,
        }

        res = self.priority_engine.calculate_priority(
            concept=self.concept_derivative,
            learner_state=learner_state,
            review_state=review_state,
            now_ms=now,
        )

        self.assertEqual(res["recommendationType"], "spaced_review")
        self.assertIn("DUE_FOR_REVIEW", res["reasonCodes"])
        self.assertNotIn("LOW_MASTERY", res["reasonCodes"])
        self.assertIn("spaced review", res["reasonSummary"].lower())

    # =========================================================================
    # Test #78: Unassessed Core Concept
    # =========================================================================
    def test_78_unassessed_core_concept_not_labeled_weak(self):
        """
        Core concept has zero evidence.
        Expected: labeled 'Not Assessed', can receive diagnostic/coverage priority, NOT weak.
        """
        res = self.priority_engine.calculate_priority(
            concept=self.concept_chain_rule,
            learner_state=None, # Zero evidence
        )

        self.assertIn("NOT_ASSESSED", res["reasonCodes"])
        self.assertNotIn("LOW_MASTERY", res["reasonCodes"])
        self.assertIn("not yet assessed", res["reasonSummary"].lower())
        self.assertFalse("weak" in res["reasonSummary"].lower())
        self.assertEqual(res["recommendationType"], "learn")

    # =========================================================================
    # Test #79: Prerequisite Blocker
    # =========================================================================
    def test_79_prerequisite_blocker_prioritization(self):
        """
        Chain Rule = 0.55 (developing).
        Basic Differentiation = 0.28 (weak prerequisite).
        Expected: Basic Differentiation prioritized before advanced Chain Rule practice.
        """
        concepts = [self.concept_chain_rule, self.concept_basic_diff]
        learner_states = [
            {"conceptId": "c_chain_rule", "masteryProbability": 0.55, "masteryBand": "developing", "evidenceCount": 3},
            {"conceptId": "c_basic_diff", "masteryProbability": 0.28, "masteryBand": "needs_attention", "evidenceCount": 3, "incorrectAttempts": 2},
        ]
        relationships = [
            {"relationType": "PREREQUISITE_OF", "fromConceptId": "c_basic_diff", "toConceptId": "c_chain_rule"}
        ]

        recs = self.recommendation_engine.generate_recommendations(
            course_id="course_1",
            user_id="user_1",
            concepts=concepts,
            learner_states=learner_states,
            relationships=relationships,
            active_misconceptions=[],
            review_states=[],
            sources=[],
        )

        # Basic Differentiation should rank higher than Chain Rule because it's a prerequisite blocker
        self.assertEqual(recs[0]["conceptId"], "c_basic_diff")
        self.assertIn("PREREQUISITE_BLOCKER", recs[0]["reasonCodes"])
        self.assertEqual(recs[0]["recommendationType"], "remediate_prerequisite")

    # =========================================================================
    # Test #80: Active Misconception
    # =========================================================================
    def test_80_active_misconception_remediation(self):
        """
        High-confidence misconception exists on a concept.
        Expected: targeted remediation recommendation with boosted priority.
        """
        active_misconceptions = [
            {
                "conceptId": "c_chain_rule",
                "conceptName": "Chain Rule",
                "misconceptionKey": "chain_rule_power_rule_confusion",
                "description": "Applies power rule without multiplying by inner derivative",
                "confidence": "high",
                "active": True,
            }
        ]

        res = self.priority_engine.calculate_priority(
            concept=self.concept_chain_rule,
            learner_state={"conceptId": "c_chain_rule", "masteryProbability": 0.45, "masteryBand": "developing", "evidenceCount": 3},
            active_misconceptions=active_misconceptions,
        )

        self.assertEqual(res["recommendationType"], "address_misconception")
        self.assertIn("ACTIVE_MISCONCEPTION", res["reasonCodes"])
        self.assertIn("power rule", res["reasonSummary"].lower())

    # =========================================================================
    # Test #81: Multimodal Source Recommendation
    # =========================================================================
    def test_81_multimodal_source_recommendation(self):
        """
        Weak concept has PDF, PPTX with diagram, and video lecture.
        Expected: best multimodal source is selected with clear explainable reason.
        """
        sources = [
            {"_id": "s_pdf", "name": "Calculus Textbook.pdf", "type": "pdf", "status": "ready", "pageCount": 50},
            {"_id": "s_pptx", "name": "Lecture 04 Slides.pptx", "type": "pptx", "status": "ready", "slideCount": 20},
            {"_id": "s_video", "name": "Lecture 04 Video.mp4", "type": "video", "status": "ready", "durationSeconds": 1800},
        ]
        visuals = [
            {"sourceId": "s_pptx", "locationType": "slide", "slideNumber": 8, "diagramCount": 1, "visualId": "diagram_chain_rule"}
        ]
        evidence = [
            {"conceptId": "c_chain_rule", "sourceId": "s_video", "startTime": 372, "endTime": 425}
        ]

        recommended = self.source_recommender.recommend_sources(
            concept=self.concept_chain_rule,
            sources=sources,
            visuals=visuals,
            evidence_items=evidence,
            learner_state={"masteryBand": "needs_attention"},
            limit=2,
        )

        self.assertGreaterEqual(len(recommended), 1)
        # Should contain diagram slide or video timestamp segment
        first_source = recommended[0]
        self.assertIn(first_source["modality"], ("diagram", "video"))
        self.assertTrue(len(first_source["evidenceReason"]) > 10)

    # =========================================================================
    # Test #82: Daily 30-Minute Plan
    # =========================================================================
    def test_82_daily_30_min_plan_time_budget(self):
        """
        Generate 30 minutes plan.
        Expected: total scheduled activity time does not materially exceed 30 minutes.
        """
        sample_recs = [
            {"conceptId": "c1", "conceptName": "Chain Rule", "priorityBand": "critical", "priorityScore": 85, "recommendationType": "practice"},
            {"conceptId": "c2", "conceptName": "Basic Diff", "priorityBand": "high", "priorityScore": 70, "recommendationType": "review"},
            {"conceptId": "c3", "conceptName": "Quotient Rule", "priorityBand": "medium", "priorityScore": 45, "recommendationType": "learn"},
            {"conceptId": "c4", "conceptName": "Product Rule", "priorityBand": "low", "priorityScore": 20, "recommendationType": "review"},
        ]

        plan = self.study_plan_builder.build_daily_plan(
            recommendations=sample_recs,
            daily_minutes=30,
            today_date_str="2026-11-07",
        )

        total_mins = plan["scheduledMinutes"]
        self.assertLessEqual(total_mins, 30)
        self.assertGreaterEqual(total_mins, 15)
        self.assertTrue(len(plan["items"]) >= 2)

    # =========================================================================
    # Test #83: Exam Plan with Core Frontloading
    # =========================================================================
    def test_83_exam_plan_schedule_and_frontloading(self):
        """
        Exam in 14 days, daily 45 minutes.
        Expected: schedule fits within available days/time, core and high-priority concepts appear earlier.
        """
        sample_recs = [
            {"conceptId": "c_minor", "conceptName": "Minor Topic", "priorityBand": "low", "priorityScore": 20, "reasonCodes": []},
            {"conceptId": "c_core", "conceptName": "Core Differentiation", "priorityBand": "critical", "priorityScore": 88, "reasonCodes": ["CORE_CONCEPT", "LOW_MASTERY"]},
        ]

        plan = self.exam_plan_builder.build_exam_plan(
            recommendations=sample_recs,
            target_date_str="2026-11-21",
            daily_minutes=45,
            start_date_str="2026-11-07",
        )

        self.assertEqual(plan["planType"], "exam_preparation")
        self.assertIn(plan["examReadiness"], ("early", "developing", "on_track", "strong"))
        # First scheduled items should be the core concept
        self.assertEqual(plan["items"][0]["conceptId"], "c_core")

    # =========================================================================
    # Test #84: Exam Plan with Low Coverage
    # =========================================================================
    def test_84_exam_plan_with_low_coverage(self):
        """
        Coverage is low (unassessed core concepts).
        Expected: Exam readiness is early/developing, balances diagnostic coverage with weak topic review.
        """
        sample_recs = [
            {"conceptId": "c1", "conceptName": "Core A", "priorityBand": "high", "reasonCodes": ["CORE_CONCEPT", "NOT_ASSESSED"]},
            {"conceptId": "c2", "conceptName": "Core B", "priorityBand": "high", "reasonCodes": ["CORE_CONCEPT", "NOT_ASSESSED"]},
            {"conceptId": "c3", "conceptName": "Core C", "priorityBand": "critical", "reasonCodes": ["CORE_CONCEPT", "LOW_MASTERY"]},
        ]

        readiness, details = self.exam_plan_builder.evaluate_exam_readiness(sample_recs)
        self.assertIn(readiness, ("early", "developing"))
        self.assertEqual(details["unassessedCoreConcepts"], 2)

    # =========================================================================
    # Test #85: Study Item Completion Does NOT Modify Mastery
    # =========================================================================
    def test_85_completed_study_item_does_not_modify_mastery(self):
        """
        Section 37 & 38: Completing a study item logs activity event, but persistent V8 mastery remains unchanged.
        """
        mock_convex = MagicMock()
        mock_convex.mutation.return_value = {"success": True, "completedAt": 12345678}
        service = StudyIntelligenceService(convex_client=mock_convex)

        res = service.complete_study_item(
            item_id="item_123",
            user_id="user_1",
            duration_seconds=600,
        )

        self.assertTrue(res.get("success"))
        # Verify completeStudyPlanItem was called on studyIntelligence, NEVER a mutation on learnerConceptStates or mastery
        called_mutations = [call[0][0] for call in mock_convex.mutation.call_args_list]
        self.assertIn("studyIntelligence:completeStudyPlanItem", called_mutations)
        self.assertNotIn("learnerModel:updateMastery", called_mutations)

    # =========================================================================
    # Test #86: Completed Quiz Updates Mastery and Triggers Recompute
    # =========================================================================
    def test_86_completed_quiz_recompute_loop(self):
        """
        Section 86: Graded assessment updates learner model, which refreshes study recommendations.
        """
        before_state = {
            "conceptId": "c1",
            "masteryProbability": 0.30,
            "masteryBand": "needs_attention",
            "confidence": "high",
            "evidenceCount": 3,
            "incorrectAttempts": 2,
        }
        rec_before = self.priority_engine.calculate_priority(self.concept_chain_rule, learner_state=before_state)
        self.assertEqual(rec_before["priorityBand"], "critical")

        # After quiz graded successfully, mastery improves to proficient
        after_state = {
            "conceptId": "c1",
            "masteryProbability": 0.82,
            "masteryBand": "proficient",
            "confidence": "high",
            "evidenceCount": 5,
            "incorrectAttempts": 0,
        }
        rec_after = self.priority_engine.calculate_priority(self.concept_chain_rule, learner_state=after_state)

        # Priority must fall significantly
        self.assertLess(rec_after["priorityScore"], rec_before["priorityScore"])
        self.assertIn(rec_after["priorityBand"], ("medium", "low"))

    # =========================================================================
    # Test #87: Missed Item Rebalancing Without Duplicates
    # =========================================================================
    def test_87_missed_items_rebalance_without_duplicates(self):
        """
        Section 35 & 36: Pending items from past dates are rescheduled to today without creating duplicates.
        """
        existing_items = [
            {"date": "2026-11-05", "conceptId": "c_chain_rule", "status": "pending", "durationMinutes": 10},
            {"date": "2026-11-06", "conceptId": "c_chain_rule", "status": "pending", "durationMinutes": 10},
            {"date": "2026-11-05", "conceptId": "c_basic_diff", "status": "completed", "durationMinutes": 10},
        ]

        rebalanced = self.study_plan_builder.rebalance_items(
            existing_items=existing_items,
            today_date_str="2026-11-07",
        )

        # Completed item remains on 2026-11-05
        completed_it = next(it for it in rebalanced if it["conceptId"] == "c_basic_diff")
        self.assertEqual(completed_it["date"], "2026-11-05")

        # The two missed pending items for c_chain_rule should deduplicate to a single item on 2026-11-07
        chain_rule_items = [it for it in rebalanced if it["conceptId"] == "c_chain_rule"]
        self.assertEqual(len(chain_rule_items), 1)
        self.assertEqual(chain_rule_items[0]["date"], "2026-11-07")

    # =========================================================================
    # Test #88: Source Deletion Fallback
    # =========================================================================
    def test_88_source_deletion_fallback(self):
        """
        Section 56: If currently recommended source is deleted/archived, recommendation falls back to alternate evidence.
        """
        sources_with_deleted = [
            {"_id": "s_deleted", "name": "Deleted Slide.pptx", "status": "failed", "isArchived": True},
            {"_id": "s_active", "name": "Active Book.pdf", "status": "ready", "pageCount": 40, "isArchived": False},
        ]

        recommended = self.source_recommender.recommend_sources(
            concept=self.concept_chain_rule,
            sources=sources_with_deleted,
            limit=2,
        )

        self.assertEqual(len(recommended), 1)
        self.assertEqual(recommended[0]["sourceId"], "s_active")

    # =========================================================================
    # Test #89 & #90: Mastery Improvement and Decline
    # =========================================================================
    def test_89_and_90_mastery_dynamics(self):
        """
        Test #89: Weak concept improves -> priority falls.
        Test #90: Performance worsens (new errors) -> priority rises.
        """
        concept = self.concept_chain_rule

        # Initial developing
        base_res = self.priority_engine.calculate_priority(
            concept=concept,
            learner_state={"masteryProbability": 0.50, "masteryBand": "developing", "evidenceCount": 3, "incorrectAttempts": 1},
        )

        # Improvement
        improved_res = self.priority_engine.calculate_priority(
            concept=concept,
            learner_state={"masteryProbability": 0.88, "masteryBand": "strong", "evidenceCount": 5, "incorrectAttempts": 0},
        )
        self.assertLess(improved_res["priorityScore"], base_res["priorityScore"])

        # Decline
        declined_res = self.priority_engine.calculate_priority(
            concept=concept,
            learner_state={"masteryProbability": 0.32, "masteryBand": "needs_attention", "evidenceCount": 4, "incorrectAttempts": 3},
        )
        self.assertGreater(declined_res["priorityScore"], base_res["priorityScore"])

    # =========================================================================
    # Test #91: New Learner Diagnostic Recommendation
    # =========================================================================
    def test_91_new_learner_recommends_diagnostic(self):
        """
        Section 58 & 59: Learner has no assessments. System recommends diagnostic coverage, NOT fake weak topics.
        """
        res = self.priority_engine.calculate_priority(
            concept=self.concept_chain_rule,
            learner_state=None,
        )

        self.assertEqual(res["recommendationType"], "learn")
        self.assertIn("NOT_ASSESSED", res["reasonCodes"])
        self.assertNotIn("LOW_MASTERY", res["reasonCodes"])

        asst_config = self.assessment_recommender.recommend_assessment_config(
            concept=self.concept_chain_rule,
            learner_state=None,
            is_diagnostic=True,
        )
        self.assertTrue(asst_config["isDiagnostic"])
        self.assertEqual(asst_config["questionCount"], 10)

    # =========================================================================
    # Test #92: Study Tutor Query Integration
    # =========================================================================
    def test_92_study_tutor_query_integration(self):
        """
        Section 49 & 50: Asking 'What should I study next?' reflects actual backend recommendations.
        """
        mock_convex = MagicMock()
        mock_convex.query.side_effect = lambda fn, args: (
            {"concepts": [self.concept_chain_rule], "relationships": []} if "getCourseKnowledgeGraph" in fn
            else ([{"conceptId": "c_chain_rule", "masteryProbability": 0.35, "masteryBand": "needs_attention", "evidenceCount": 2}] if "getCourseConceptStates" in fn
            else [])
        )

        tutor_service = AdaptiveTutorService(convex_client=mock_convex)
        res = tutor_service.ask_adaptive_tutor(
            course_id="c_1",
            session_id="s_1",
            user_id="u_1",
            question="What should I study next?",
        )

        self.assertTrue(res["grounded"])
        self.assertIn("Chain Rule", res["answer"])
        self.assertIn("Priority", res["answer"])

    # =========================================================================
    # Test #93: Exam Tutor Query Integration
    # =========================================================================
    def test_93_exam_tutor_query_integration(self):
        """
        Section 50: Asking 'What should I focus on before my exam?' uses exam plan data.
        """
        mock_convex = MagicMock()
        mock_convex.query.side_effect = lambda fn, args: (
            {"concepts": [self.concept_chain_rule], "relationships": []} if "getCourseKnowledgeGraph" in fn
            else ([{"conceptId": "c_chain_rule", "masteryProbability": 0.35, "masteryBand": "needs_attention", "evidenceCount": 2}] if "getCourseConceptStates" in fn
            else ({"examReadiness": "developing", "dailyMinutes": 45} if "getActiveStudyPlan" in fn
            else []))
        )

        tutor_service = AdaptiveTutorService(convex_client=mock_convex)
        res = tutor_service.ask_adaptive_tutor(
            course_id="c_1",
            session_id="s_1",
            user_id="u_1",
            question="What should I focus on before my exam?",
        )

        self.assertTrue(res["grounded"])
        self.assertIn("exam revision", res["answer"].lower())
        self.assertIn("Chain Rule", res["answer"])

    # =========================================================================
    # Test #94: User Isolation
    # =========================================================================
    def test_94_user_isolation(self):
        """
        User A's recommendations and plans are private and cannot bleed into User B.
        """
        recs_user_a = self.recommendation_engine.generate_recommendations(
            course_id="course_1",
            user_id="user_A",
            concepts=[self.concept_chain_rule],
            learner_states=[{
                "conceptId": "c_chain_rule",
                "masteryProbability": 0.20,
                "masteryBand": "needs_attention",
                "confidence": "high",
                "evidenceCount": 3,
                "incorrectAttempts": 2,
            }],
            relationships=[],
            active_misconceptions=[],
            review_states=[],
            sources=[],
        )

        recs_user_b = self.recommendation_engine.generate_recommendations(
            course_id="course_1",
            user_id="user_B",
            concepts=[self.concept_chain_rule],
            learner_states=[{"conceptId": "c_chain_rule", "masteryProbability": 0.95, "masteryBand": "strong", "evidenceCount": 5}],
            relationships=[],
            active_misconceptions=[],
            review_states=[],
            sources=[],
        )

        self.assertEqual(recs_user_a[0]["userId"], "user_A")
        self.assertEqual(recs_user_b[0]["userId"], "user_B")
        self.assertGreater(recs_user_a[0]["priorityScore"], recs_user_b[0]["priorityScore"])
        self.assertEqual(recs_user_a[0]["priorityBand"], "critical")
        self.assertEqual(recs_user_b[0]["priorityBand"], "low")

    # =========================================================================
    # Test #95: Course Isolation
    # =========================================================================
    def test_95_course_isolation(self):
        """
        Course A concepts and priorities are isolated from Course B.
        """
        concept_course_b = {"_id": "c_physics", "name": "Newton Laws", "importance": "core"}

        recs_course_a = self.recommendation_engine.generate_recommendations(
            course_id="course_A",
            user_id="user_1",
            concepts=[self.concept_chain_rule],
            learner_states=[],
            relationships=[],
            active_misconceptions=[],
            review_states=[],
            sources=[],
        )

        recs_course_b = self.recommendation_engine.generate_recommendations(
            course_id="course_B",
            user_id="user_1",
            concepts=[concept_course_b],
            learner_states=[],
            relationships=[],
            active_misconceptions=[],
            review_states=[],
            sources=[],
        )

        self.assertEqual(recs_course_a[0]["courseId"], "course_A")
        self.assertEqual(recs_course_b[0]["courseId"], "course_B")
        self.assertEqual(recs_course_a[0]["conceptName"], "Chain Rule")
        self.assertEqual(recs_course_b[0]["conceptName"], "Newton Laws")


if __name__ == "__main__":
    unittest.main()
