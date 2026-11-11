"""
Study Intelligence Evaluator:
Tests Cognivue's real RecommendationEngine, PriorityEngine, SpacedReviewEngine, StudyPlanBuilder,
and MasteryEngine across recommendation ordering, explainability, unassessed labeling,
spaced review scheduling, time budget caps, and full fail->study->reprioritize closed loop.
"""

import time
from typing import Any, Dict, List, Optional
from app.services.evaluation.base_evaluator import BaseEvaluator, EvalCaseResult
from app.services.learner_model.mastery_engine import MasteryEngine
from app.services.learner_model.confidence_engine import ConfidenceEngine
from app.services.study_intelligence.priority_engine import PriorityEngine
from app.services.study_intelligence.recommendation_engine import RecommendationEngine
from app.services.study_intelligence.spaced_review_engine import SpacedReviewEngine
from app.services.study_intelligence.study_plan_builder import StudyPlanBuilder


class StudyIntelligenceEvaluator(BaseEvaluator):
    category = "study_intelligence"

    def __init__(self):
        self.priority_engine = PriorityEngine()
        self.rec_engine = RecommendationEngine()
        self.spaced_engine = SpacedReviewEngine()
        self.plan_builder = StudyPlanBuilder()
        self.mastery_engine = MasteryEngine()
        self.confidence_engine = ConfidenceEngine()

    def evaluate_cases(
        self,
        cases: List[Dict[str, Any]],
        fixtures: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
    ) -> List[EvalCaseResult]:
        results: List[EvalCaseResult] = []
        now_ms = 1730259200000

        for case in cases:
            t0 = time.perf_counter()
            inp = case.get("input", {})
            exp = case.get("expectedBehavior", {})
            scenario = inp.get("scenarioType")
            failure_reasons: List[str] = []
            scores: Dict[str, float] = {}
            sys_out: Dict[str, Any] = {}

            if scenario == "weak_beats_strong_and_prereq_blocker":
                recs = self.rec_engine.generate_recommendations(
                    course_id=fixtures.get("courseId", "eval_course"),
                    user_id=fixtures.get("userId", "eval_user"),
                    concepts=inp["concepts"],
                    learner_states=inp["learnerStates"],
                    relationships=inp["relationships"],
                    active_misconceptions=inp["activeMisconceptions"],
                    review_states=inp.get("reviewStates", []),
                    sources=fixtures.get("sources", []),
                    now_ms=now_ms,
                )
                top_id = recs[0]["conceptId"] if recs else None
                last_id = recs[-1]["conceptId"] if recs else None
                prereq_rec = next((r for r in recs if r["conceptId"] == exp["mustFlagPrereqBlockerConcept"]), None)
                prereq_flagged = bool(prereq_rec and "PREREQUISITE_BLOCKER" in prereq_rec.get("reasonCodes", []))
                explainable = all(bool(r.get("reasonCodes")) and bool(r.get("reasonSummary")) for r in recs)

                if top_id != exp["topRecommendedConceptId"]:
                    failure_reasons.append(f"Expected top concept {exp['topRecommendedConceptId']}, got {top_id}.")
                if last_id != exp["strongestMustRankLast"]:
                    failure_reasons.append(f"Strongest concept should rank last ({exp['strongestMustRankLast']}), got {last_id}.")
                if not prereq_flagged:
                    failure_reasons.append("Weak prerequisite blocker was not flagged with PREREQUISITE_BLOCKER.")
                if not explainable:
                    failure_reasons.append("One or more study recommendations lacked reasonCodes/reasonSummary.")

                ok = len(failure_reasons) == 0
                scores = {
                    "overallScore": 1.0 if ok else 0.0,
                    "studyLogicConsistency": 1.0 if ok else 0.0,
                    "explainabilityRate": 1.0 if explainable else 0.0,
                }
                sys_out = {"rankedConceptIds": [r["conceptId"] for r in recs], "topReason": recs[0].get("reasonSummary") if recs else ""}

            elif scenario == "unassessed_never_labeled_weak":
                pr = self.priority_engine.calculate_priority(
                    concept=inp["concept"],
                    learner_state=inp["learnerState"],
                    now_ms=now_ms,
                )
                ok = (
                    exp["expectedReasonCode"] in pr.get("reasonCodes", [])
                    and all(bad not in pr.get("reasonCodes", []) for bad in exp.get("forbiddenReasonCodes", []))
                    and pr.get("reasonDetails", {}).get("masteryBand") == exp["expectedDetailBand"]
                )
                if not ok:
                    failure_reasons.append(f"Unassessed concept mislabeled: {pr}")
                scores = {"overallScore": 1.0 if ok else 0.0, "unassessedSemanticsPass": 1.0 if ok else 0.0}
                sys_out = pr

            elif scenario == "spaced_review_and_daily_budget":
                succ = self.spaced_engine.compute_next_review(inp["reviewSeed"], {"masteryBand": "developing"}, "success", now_ms)
                fail = self.spaced_engine.compute_next_review(inp["reviewSeed"], {"masteryBand": "developing"}, "fail", now_ms)

                sample_recs = [
                    {
                        "conceptId": "con_chain_rule",
                        "conceptName": "Chain Rule",
                        "priorityScore": 85,
                        "priorityBand": "high",
                        "reasonSummary": "Needs attention",
                        "recommendedSourceIds": [{"sourceId": "src_pdf_calculus", "title": "Notes"}],
                    },
                    {
                        "conceptId": "con_composite",
                        "conceptName": "Composite Functions",
                        "priorityScore": 70,
                        "priorityBand": "high",
                        "reasonSummary": "Prerequisite blocker",
                        "recommendedSourceIds": [{"sourceId": "src_pdf_calculus", "title": "Notes"}],
                    },
                    {
                        "conceptId": "con_relu",
                        "conceptName": "ReLU Activation",
                        "priorityScore": 50,
                        "priorityBand": "medium",
                        "reasonSummary": "Due for review",
                        "recommendedSourceIds": [{"sourceId": "src_pptx_ml", "title": "Slides"}],
                    },
                ]
                plan = self.plan_builder.build_daily_plan(sample_recs, daily_minutes=int(inp["dailyMinutes"]), today_date_str="2026-11-12")
                ok = (
                    succ["reviewIntervalDays"] == exp["successIntervalDaysExpected"]
                    and fail["reviewIntervalDays"] == exp["failIntervalDaysExpected"]
                    and plan["scheduledMinutes"] <= exp["scheduledMinutesMax"]
                    and len(plan["items"]) >= 1
                )
                if not ok:
                    failure_reasons.append(f"Spaced review / budget violation: succ={succ['reviewIntervalDays']}, fail={fail['reviewIntervalDays']}, sched={plan['scheduledMinutes']}")
                scores = {"overallScore": 1.0 if ok else 0.0, "spacedBudgetPass": 1.0 if ok else 0.0}
                sys_out = {"successDays": succ["reviewIntervalDays"], "failDays": fail["reviewIntervalDays"], "scheduledMinutes": plan["scheduledMinutes"]}

            elif scenario == "full_closed_loop_reprioritization":
                concept = inp["concept"]
                obs_before = inp["initialObservations"]
                obs_after = obs_before + inp["remedialObservations"]

                m1 = self.mastery_engine.compute_mastery(obs_before, now_ms)
                c1_score, c1_lvl = self.confidence_engine.compute_confidence(obs_before, m1["difficulty_exposure"])
                b1 = self.confidence_engine.determine_mastery_band(m1["mastery_probability"], len(obs_before), c1_lvl)
                p1 = self.priority_engine.calculate_priority(
                    concept,
                    {
                        "masteryProbability": m1["mastery_probability"],
                        "masteryBand": b1,
                        "confidence": c1_lvl,
                        "evidenceCount": len(obs_before),
                    },
                    now_ms=now_ms,
                )

                m2 = self.mastery_engine.compute_mastery(obs_after, now_ms + 86400000)
                c2_score, c2_lvl = self.confidence_engine.compute_confidence(obs_after, m2["difficulty_exposure"])
                b2 = self.confidence_engine.determine_mastery_band(m2["mastery_probability"], len(obs_after), c2_lvl)
                p2 = self.priority_engine.calculate_priority(
                    concept,
                    {
                        "masteryProbability": m2["mastery_probability"],
                        "masteryBand": b2,
                        "confidence": c2_lvl,
                        "evidenceCount": len(obs_after),
                    },
                    now_ms=now_ms + 86400000,
                )

                mastery_up = m2["mastery_probability"] > m1["mastery_probability"]
                priority_down = p2["priorityScore"] < p1["priorityScore"]
                if not (mastery_up and priority_down):
                    failure_reasons.append(f"Closed-loop reprioritization failed: mastery {m1['mastery_probability']}->{m2['mastery_probability']}, priority {p1['priorityScore']}->{p2['priorityScore']}.")
                scores = {"overallScore": 1.0 if (mastery_up and priority_down) else 0.0, "closedLoopReprioritization": 1.0 if (mastery_up and priority_down) else 0.0}
                sys_out = {
                    "before": {"mastery": m1["mastery_probability"], "band": b1, "priorityScore": p1["priorityScore"]},
                    "after": {"mastery": m2["mastery_probability"], "band": b2, "priorityScore": p2["priorityScore"]},
                }

            latency_ms = (time.perf_counter() - t0) * 1000.0
            results.append(
                EvalCaseResult(
                    case_id=case["caseId"],
                    category=self.category,
                    passed=len(failure_reasons) == 0,
                    scores=scores,
                    system_output=sys_out,
                    failure_reasons=failure_reasons,
                    latency_ms=latency_ms,
                )
            )

        return results

