"""
Learner Model Stability Evaluator:
Verifies deterministic knowledge-tracing invariants via MasteryEngine and ConfidenceEngine:
- Monotonicity (correct -> up/hold, wrong -> down)
- Idempotency / observationKey deduplication (zero double-counting)
- Single easy question confidence/band guardrails
- Recency decay ordering
"""

import time
from typing import Any, Dict, List, Optional
from app.services.evaluation.base_evaluator import BaseEvaluator, EvalCaseResult
from app.services.learner_model.mastery_engine import MasteryEngine
from app.services.learner_model.confidence_engine import ConfidenceEngine


class LearnerModelEvaluator(BaseEvaluator):
    category = "learner_model"

    def __init__(self):
        self.mastery_engine = MasteryEngine()
        self.confidence_engine = ConfidenceEngine()

    @staticmethod
    def _deduplicate_observations(obs_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        deduped = []
        for o in obs_list:
            k = o.get("observationKey") or id(o)
            if k not in seen:
                seen.add(k)
                deduped.append(o)
        return deduped

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
            inv = inp.get("invariantType")
            ref_ts = int(inp.get("referenceTimestamp", 1730259200000))
            failure_reasons: List[str] = []
            critical_failure = False
            scores: Dict[str, float] = {}
            sys_out: Dict[str, Any] = {}

            if inv == "monotonicity":
                base = self.mastery_engine.compute_mastery(inp["baseObservations"], ref_ts)
                after_correct = self.mastery_engine.compute_mastery(
                    inp["baseObservations"] + [inp["additionalCorrect"]], ref_ts
                )
                after_incorrect = self.mastery_engine.compute_mastery(
                    inp["baseObservations"] + [inp["additionalIncorrect"]], ref_ts
                )
                up_ok = after_correct["mastery_probability"] >= base["mastery_probability"]
                down_ok = after_incorrect["mastery_probability"] < base["mastery_probability"]
                if not up_ok:
                    failure_reasons.append(f"Correct answer lowered mastery ({base['mastery_probability']} -> {after_correct['mastery_probability']}).")
                if not down_ok:
                    failure_reasons.append(f"Incorrect answer did not lower mastery ({base['mastery_probability']} -> {after_incorrect['mastery_probability']}).")
                scores = {
                    "overallScore": 1.0 if (up_ok and down_ok) else 0.0,
                    "monotonicityPass": 1.0 if (up_ok and down_ok) else 0.0,
                }
                sys_out = {
                    "base": base["mastery_probability"],
                    "afterCorrect": after_correct["mastery_probability"],
                    "afterIncorrect": after_incorrect["mastery_probability"],
                }

            elif inv == "idempotency_deduplication":
                clean = self._deduplicate_observations(inp["observations"])
                retried = self._deduplicate_observations(inp["duplicateRetrySubmission"])
                res_a = self.mastery_engine.compute_mastery(clean, ref_ts)
                res_b = self.mastery_engine.compute_mastery(retried, ref_ts)
                exact_same = (
                    abs(res_a["mastery_probability"] - res_b["mastery_probability"]) < 1e-9
                    and len(retried) == int(exp.get("dedupCountExpected", len(clean)))
                )
                if not exact_same:
                    critical_failure = True
                    failure_reasons.append("Observation deduplication failed (double-counting risk).")
                scores = {
                    "overallScore": 1.0 if exact_same else 0.0,
                    "idempotencyPass": 1.0 if exact_same else 0.0,
                }
                sys_out = {"cleanCount": len(clean), "retriedDedupCount": len(retried), "mastery": res_b["mastery_probability"]}

            elif inv == "low_evidence_confidence_guard":
                obs = inp["observations"]
                m_res = self.mastery_engine.compute_mastery(obs, ref_ts)
                conf_score, conf_level = self.confidence_engine.compute_confidence(obs, m_res["difficulty_exposure"])
                band = self.confidence_engine.determine_mastery_band(m_res["mastery_probability"], len(obs), conf_level)
                ok = (
                    conf_level not in exp.get("forbiddenConfidenceLevels", [])
                    and band not in exp.get("forbiddenMasteryBands", [])
                )
                if not ok:
                    failure_reasons.append(f"Single easy answer falsely claimed confidence='{conf_level}', band='{band}'.")
                scores = {
                    "overallScore": 1.0 if ok else 0.0,
                    "confidenceCalibrationPass": 1.0 if ok else 0.0,
                }
                sys_out = {"confidenceScore": conf_score, "confidenceLevel": conf_level, "masteryBand": band}

            elif inv == "recency_stability":
                r_err = self.mastery_engine.compute_mastery(inp["recentErrorObs"], ref_ts)
                o_err = self.mastery_engine.compute_mastery(inp["olderErrorObs"], ref_ts)
                ok = r_err["mastery_probability"] < o_err["mastery_probability"]
                if not ok:
                    failure_reasons.append(
                        f"Recent error mastery ({r_err['mastery_probability']}) not lower than older error ({o_err['mastery_probability']})."
                    )
                scores = {
                    "overallScore": 1.0 if ok else 0.0,
                    "recencyStabilityPass": 1.0 if ok else 0.0,
                }
                sys_out = {"recentErrorMastery": r_err["mastery_probability"], "olderErrorMastery": o_err["mastery_probability"]}

            latency_ms = (time.perf_counter() - t0) * 1000.0
            results.append(
                EvalCaseResult(
                    case_id=case["caseId"],
                    category=self.category,
                    passed=len(failure_reasons) == 0,
                    critical_failure=critical_failure,
                    scores=scores,
                    system_output=sys_out,
                    failure_reasons=failure_reasons,
                    latency_ms=latency_ms,
                )
            )

        return results

