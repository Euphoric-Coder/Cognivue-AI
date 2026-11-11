"""
Metrics Aggregator for Cognivue AI Evaluation & Benchmarking (V11).
Every metric is calculated transparently from stored EvalCaseResult objects (numerator / denominator).
No hard-coded or fabricated aggregate numbers.
"""

import math
from typing import Any, Dict, List


class MetricsAggregator:
    """Computes category metrics, suite summaries, latency percentiles, usage, and failure stats."""

    @staticmethod
    def _percentile(sorted_vals: List[float], pct: float) -> float:
        if not sorted_vals:
            return 0.0
        idx = int(math.ceil((pct / 100.0) * len(sorted_vals))) - 1
        idx = max(0, min(len(sorted_vals) - 1, idx))
        return round(sorted_vals[idx], 2)

    @classmethod
    def aggregate(cls, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        total = len(results)
        passed = sum(1 for r in results if r.get("passed"))
        failed = total - passed
        critical_count = sum(1 for r in results if r.get("criticalFailure"))

        # Latencies
        latencies = sorted(float(r.get("latencyMs", 0.0)) for r in results)
        latency_stats = {
            "meanMs": round(sum(latencies) / total, 2) if total else 0.0,
            "p50Ms": cls._percentile(latencies, 50),
            "p95Ms": cls._percentile(latencies, 95),
            "maxMs": round(latencies[-1], 2) if latencies else 0.0,
        }

        # Usage & cost tracking
        judge_calls = sum(int(r.get("usage", {}).get("judgeCalls", 0)) for r in results)
        prompt_tokens = sum(int(r.get("usage", {}).get("promptTokens", 0)) for r in results)
        completion_tokens = sum(int(r.get("usage", {}).get("completionTokens", 0)) for r in results)
        # Estimate cost at $0.10 / 1M input + $0.40 / 1M output when live tokens > 0
        est_cost = round((prompt_tokens * 0.0000001) + (completion_tokens * 0.0000004), 6)
        usage_stats = {
            "judgeCalls": judge_calls,
            "promptTokens": prompt_tokens,
            "completionTokens": completion_tokens,
            "estimatedCostUsd": est_cost,
        }

        # Failure stats by category & reasons
        by_category: Dict[str, List[Dict[str, Any]]] = {}
        failure_by_category: Dict[str, int] = {}
        for r in results:
            cat = r.get("category", "unknown")
            by_category.setdefault(cat, []).append(r)
            if not r.get("passed"):
                failure_by_category[cat] = failure_by_category.get(cat, 0) + 1

        metrics: List[Dict[str, Any]] = []

        # Overall Suite Metrics
        metrics.append({
            "metricName": "overall_pass_rate",
            "value": round(passed / total, 4) if total else 0.0,
            "numerator": passed,
            "denominator": total,
            "category": "overall",
            "description": "Fraction of evaluation test cases passing all automated checks (passedCount / caseCount).",
        })

        # Category pass rates + specific score metrics
        score_sums: Dict[str, Dict[str, List[float]]] = {}
        for cat, cat_results in by_category.items():
            cat_pass = sum(1 for r in cat_results if r.get("passed"))
            metrics.append({
                "metricName": f"{cat}_pass_rate",
                "value": round(cat_pass / len(cat_results), 4),
                "numerator": cat_pass,
                "denominator": len(cat_results),
                "category": cat,
                "description": f"Case pass rate for {cat} category.",
            })

            cat_metric_lists: Dict[str, List[float]] = {}
            for r in cat_results:
                for k, v in (r.get("scores") or {}).items():
                    if isinstance(v, (int, float)):
                        cat_metric_lists.setdefault(k, []).append(float(v))
            score_sums[cat] = cat_metric_lists

            for m_key, vals in cat_metric_lists.items():
                if not vals:
                    continue
                # Map canonical metric names concisely
                mean_val = round(sum(vals) / len(vals), 4)
                metrics.append({
                    "metricName": f"{cat}.{m_key}",
                    "value": mean_val,
                    "numerator": round(sum(vals), 4),
                    "denominator": len(vals),
                    "category": cat,
                    "description": f"Mean {m_key} across {len(vals)} {cat} case(s).",
                })

        # Derived friendly summary metrics for dashboard display & Release Gate
        rag_scores = score_sums.get("rag", {})
        if "faithfulness" in rag_scores:
            vals = rag_scores["faithfulness"]
            metrics.append({
                "metricName": "rag_faithfulness",
                "value": round(sum(vals) / len(vals), 4),
                "numerator": round(sum(vals), 4),
                "denominator": len(vals),
                "category": "rag",
                "description": "Mean RAGAS Faithfulness across RAG cases.",
            })
        if "contextPrecision" in rag_scores:
            vals = rag_scores["contextPrecision"]
            metrics.append({
                "metricName": "rag_context_relevance",
                "value": round(sum(vals) / len(vals), 4),
                "numerator": round(sum(vals), 4),
                "denominator": len(vals),
                "category": "rag",
                "description": "Mean RAGAS Context Precision / Relevance across RAG cases.",
            })
        if "citationAccuracy" in rag_scores:
            vals = rag_scores["citationAccuracy"]
            metrics.append({
                "metricName": "citation_accuracy",
                "value": round(sum(vals) / len(vals), 4),
                "numerator": round(sum(vals), 4),
                "denominator": len(vals),
                "category": "rag",
                "description": "Fraction of verified citations pointing to valid course chunks.",
            })
        if "refusalAccuracy" in rag_scores:
            vals = rag_scores["refusalAccuracy"]
            metrics.append({
                "metricName": "grounded_refusal_accuracy",
                "value": round(sum(vals) / len(vals), 4),
                "numerator": round(sum(vals), 4),
                "denominator": len(vals),
                "category": "rag",
                "description": "Combined true-refusal & non-false-refusal accuracy.",
            })

        grad_scores = score_sums.get("grading", {})
        if "objectiveAccuracy" in grad_scores:
            vals = grad_scores["objectiveAccuracy"]
            metrics.append({
                "metricName": "objective_grading_accuracy",
                "value": round(sum(vals) / len(vals), 4),
                "numerator": round(sum(vals), 4),
                "denominator": len(vals),
                "category": "grading",
                "description": "Exact accuracy on deterministic objective grading cases.",
            })

        return {
            "caseCount": total,
            "passedCount": passed,
            "failedCount": failed,
            "criticalFailureCount": critical_count,
            "overallPassRate": round(passed / total, 4) if total else 0.0,
            "metrics": metrics,
            "latencyStats": latency_stats,
            "usageStats": usage_stats,
            "failureStats": {
                "totalFailed": failed,
                "criticalFailures": critical_count,
                "byCategory": failure_by_category,
            },
        }

