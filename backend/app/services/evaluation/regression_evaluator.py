"""
Regression Evaluator & Release Gate:
- Compares candidate run metrics against a baseline run to highlight regressions & improvements.
- Evaluates Critical Release Gate invariants (cross-user/course leaks, fabricated citations,
  objective grading corruption, learner-model double-counting) + configurable minimum thresholds.
"""

from typing import Any, Dict, List, Optional


DEFAULT_RELEASE_THRESHOLDS: Dict[str, float] = {
    "overall_pass_rate": 0.90,
    "rag_faithfulness": 0.85,
    "citation_accuracy": 1.0,
    "grounded_refusal_accuracy": 0.85,
    "objective_grading_accuracy": 1.0,
    "security_pass_rate": 1.0,
}


class RegressionEvaluator:
    """Computes baseline diffs and release readiness gate decisions."""

    @staticmethod
    def compare_runs(
        current_metrics: List[Dict[str, Any]],
        baseline_metrics: List[Dict[str, Any]],
        regression_tolerance: float = -0.02,
    ) -> Dict[str, Any]:
        base_map = {m["metricName"]: float(m["value"]) for m in baseline_metrics}
        curr_map = {m["metricName"]: float(m["value"]) for m in current_metrics}

        comparisons = []
        regressions = []
        improvements = []

        for name, curr_val in curr_map.items():
            if name not in base_map:
                continue
            base_val = base_map[name]
            delta = round(curr_val - base_val, 4)
            pct_change = round(((curr_val - base_val) / base_val) * 100.0, 2) if base_val > 0 else 0.0

            status = "unchanged"
            if delta < regression_tolerance:
                status = "regressed"
                regressions.append({"metricName": name, "baseline": base_val, "current": curr_val, "delta": delta})
            elif delta > abs(regression_tolerance):
                status = "improved"
                improvements.append({"metricName": name, "baseline": base_val, "current": curr_val, "delta": delta})

            comparisons.append({
                "metricName": name,
                "baseline": base_val,
                "current": curr_val,
                "delta": delta,
                "pctChange": pct_change,
                "status": status,
            })

        return {
            "hasRegressions": len(regressions) > 0,
            "regressionCount": len(regressions),
            "improvementCount": len(improvements),
            "regressions": regressions,
            "improvements": improvements,
            "comparisons": comparisons,
        }

    @staticmethod
    def evaluate_release_gate(
        results: List[Dict[str, Any]],
        metrics: List[Dict[str, Any]],
        thresholds: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        policy = dict(DEFAULT_RELEASE_THRESHOLDS)
        if thresholds:
            policy.update(thresholds)

        metric_map = {m["metricName"]: float(m["value"]) for m in metrics}
        blockers: List[str] = []
        threshold_checks: List[Dict[str, Any]] = []

        # 1. Critical safety invariants — ANY criticalFailure immediately blocks release
        critical_cases = [r for r in results if r.get("criticalFailure")]
        for crit in critical_cases:
            reasons = "; ".join(crit.get("failureReasons") or ["Critical safety failure"])
            blockers.append(f"CRITICAL [{crit.get('category')}/{crit.get('caseId')}]: {reasons}")

        # 2. Check configured thresholds (for metrics actually present in this run)
        for m_name, min_val in policy.items():
            if m_name not in metric_map:
                continue
            observed = metric_map[m_name]
            ok = observed >= min_val
            threshold_checks.append({
                "metricName": m_name,
                "observed": observed,
                "threshold": min_val,
                "passed": ok,
            })
            if not ok:
                blockers.append(f"THRESHOLD_FAILED [{m_name}]: {observed:.4f} < minimum {min_val:.4f}")

        release_ready = len(blockers) == 0
        return {
            "releaseReady": release_ready,
            "status": "PASS" if release_ready else "FAIL",
            "criticalFailureCount": len(critical_cases),
            "blockers": blockers,
            "thresholdChecks": threshold_checks,
        }

