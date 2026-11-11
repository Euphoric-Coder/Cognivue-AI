"""
Assessment Quality Evaluator:
Executes Cognivue's real QuestionValidator, AnswerValidator, DuplicateDetector, and AssessmentPlanner
against benchmark cases covering all 8 question types, distractor ambiguity, duplicates, and evidence refusal.
"""

import time
from typing import Any, Dict, List, Optional
from app.services.evaluation.base_evaluator import BaseEvaluator, EvalCaseResult
from app.services.assessment.question_validator import QuestionValidator
from app.services.assessment.duplicate_detector import DuplicateDetector
from app.services.assessment.assessment_planner import AssessmentPlanner


class AssessmentEvaluator(BaseEvaluator):
    category = "assessment"

    def __init__(self):
        self.question_validator = QuestionValidator()
        self.duplicate_detector = DuplicateDetector()
        self.planner = AssessmentPlanner()

    def evaluate_cases(
        self,
        cases: List[Dict[str, Any]],
        fixtures: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
    ) -> List[EvalCaseResult]:
        results: List[EvalCaseResult] = []

        for case in cases:
            t0 = time.perf_counter()
            inp = case.get("input", {})
            exp = case.get("expectedBehavior", {})
            scenario = inp.get("scenarioType")
            failure_reasons: List[str] = []
            scores: Dict[str, float] = {}
            sys_out: Dict[str, Any] = {}

            if scenario == "all_question_types_validity":
                questions = inp.get("questions", [])
                valid_types = []
                rejected = []
                quality_scores = []
                for q in questions:
                    ev_items = q.get("evidenceItems", [])
                    is_valid, reason, q_score = self.question_validator.validate(q, ev_items)
                    if is_valid:
                        valid_types.append(q.get("questionType"))
                        quality_scores.append(q_score)
                    else:
                        rejected.append({"type": q.get("questionType"), "reason": reason})
                        failure_reasons.append(f"Question type '{q.get('questionType')}' rejected: {reason}")

                expected_types = set(exp.get("requiredQuestionTypes", []))
                coverage = len(set(valid_types).intersection(expected_types)) / max(1, len(expected_types))
                validity_rate = len(valid_types) / max(1, len(questions))
                avg_q_score = sum(quality_scores) / max(1, len(quality_scores))

                scores = {
                    "overallScore": round((validity_rate + coverage + avg_q_score) / 3.0, 4),
                    "questionValidityRate": round(validity_rate, 4),
                    "questionTypeCoverage": round(coverage, 4),
                    "meanQualityScore": round(avg_q_score, 4),
                }
                sys_out = {"validTypes": valid_types, "rejected": rejected}

            elif scenario == "mcq_ambiguity_and_all_above_rejection":
                bad_q = inp.get("badQuestion", {})
                is_valid, reason, _ = self.question_validator.validate(bad_q, bad_q.get("evidenceItems", []))
                rejected_correctly = not is_valid
                if not rejected_correctly:
                    failure_reasons.append("Validator accepted ambiguous/'All of the above' MCQ question.")
                scores = {
                    "overallScore": 1.0 if rejected_correctly else 0.0,
                    "ambiguityRejectionRate": 1.0 if rejected_correctly else 0.0,
                }
                sys_out = {"isValid": is_valid, "reason": reason}

            elif scenario == "duplicate_detection":
                is_dup = self.duplicate_detector.is_duplicate(inp.get("candidate", {}), inp.get("existing", []))
                if not is_dup:
                    failure_reasons.append("DuplicateDetector failed to catch semantically near-identical question.")
                scores = {
                    "overallScore": 1.0 if is_dup else 0.0,
                    "duplicateDetectionRate": 1.0 if is_dup else 0.0,
                }
                sys_out = {"isDuplicate": is_dup}

            elif scenario == "insufficient_evidence_capacity_refusal":
                plan = self.planner.plan_assessment(
                    active_concepts=inp.get("activeConcepts", []),
                    concept_evidence_map=inp.get("conceptEvidenceMap", {}),
                    requested_count=int(inp.get("requestedCount", 5)),
                )
                refused_cleanly = not plan.get("sufficientEvidence", True)
                if not refused_cleanly:
                    failure_reasons.append("AssessmentPlanner allowed generation despite zero course evidence.")
                scores = {
                    "overallScore": 1.0 if refused_cleanly else 0.0,
                    "insufficientEvidenceRefusal": 1.0 if refused_cleanly else 0.0,
                }
                sys_out = plan

            latency_ms = (time.perf_counter() - t0) * 1000.0
            passed = len(failure_reasons) == 0 and scores.get("overallScore", 0.0) >= 0.85

            results.append(
                EvalCaseResult(
                    case_id=case["caseId"],
                    category=self.category,
                    passed=passed,
                    scores=scores,
                    system_output=sys_out,
                    failure_reasons=failure_reasons,
                    latency_ms=latency_ms,
                )
            )

        return results

