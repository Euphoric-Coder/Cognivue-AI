"""
Evaluation Runner for Cognivue AI (V11):
Executes Quick Suite, Full Suite, or single-category evaluation runs strictly against
isolated benchmark fixtures/data without ever mutating user mastery, sources, or recommendations.
Tracks progress, supports local JSON/Markdown report export, and guards API costs.
"""

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.evaluation.versioning import get_version_metadata
from app.services.evaluation.rag_evaluator import RAGEvaluator
from app.services.evaluation.multimodal_evaluator import MultimodalEvaluator
from app.services.evaluation.graph_evaluator import GraphEvaluator
from app.services.evaluation.assessment_evaluator import AssessmentEvaluator
from app.services.evaluation.grading_evaluator import GradingEvaluator
from app.services.evaluation.learner_model_evaluator import LearnerModelEvaluator
from app.services.evaluation.adaptive_tutor_evaluator import AdaptiveTutorEvaluator
from app.services.evaluation.study_intelligence_evaluator import StudyIntelligenceEvaluator
from app.services.evaluation.security_evaluator import SecurityEvaluator
from app.services.evaluation.metrics_aggregator import MetricsAggregator
from app.services.evaluation.regression_evaluator import RegressionEvaluator

PROJECT_ROOT = Path(__file__).resolve().parents[4]
EVALS_DIR = PROJECT_ROOT / "evals"
RUNS_STORE_DIR = EVALS_DIR / "runs"

CATEGORY_FILE_MAP = {
    "rag": "rag_cases.json",
    "multimodal": "multimodal_cases.json",
    "knowledge_graph": "graph_cases.json",
    "assessment": "assessment_cases.json",
    "grading": "grading_cases.json",
    "learner_model": "learner_model_cases.json",
    "adaptive_tutor": "adaptive_cases.json",
    "study_intelligence": "study_intelligence_cases.json",
    "security": "security_cases.json",
}

# In-memory live progress tracker for async background runs
_ACTIVE_RUNS: Dict[str, Dict[str, Any]] = {}
_RUNS_LOCK = threading.Lock()


class EvaluationRunner:
    """Orchestrates reproducible Cognivue V11 evaluations cleanly in isolation."""

    def __init__(self, evals_dir: Optional[Path] = None, runs_dir: Optional[Path] = None):
        self.evals_dir = Path(evals_dir or EVALS_DIR)
        self.runs_dir = Path(runs_dir or RUNS_STORE_DIR)
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def load_manifest(self) -> Dict[str, Any]:
        with open(self.evals_dir / "dataset_manifest.json", "r", encoding="utf-8") as f:
            return json.load(f)

    def load_fixtures(self) -> Dict[str, Any]:
        with open(self.evals_dir / "fixtures.json", "r", encoding="utf-8") as f:
            return json.load(f)

    def load_cases(
        self,
        run_type: str = "quick_suite",
        categories: Optional[List[str]] = None,
        max_cases: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        manifest = self.load_manifest()
        quick_ids = set(manifest.get("quickSuiteCaseIds", []))

        if categories:
            target_cats = [c for c in categories if c in CATEGORY_FILE_MAP]
        elif run_type in CATEGORY_FILE_MAP:
            target_cats = [run_type]
        else:
            target_cats = list(CATEGORY_FILE_MAP.keys())

        loaded: List[Dict[str, Any]] = []
        for cat in target_cats:
            fpath = self.evals_dir / CATEGORY_FILE_MAP[cat]
            if not fpath.exists():
                continue
            with open(fpath, "r", encoding="utf-8") as f:
                items = json.load(f)
                loaded.extend(items)

        if run_type == "quick_suite" and not categories:
            filtered = [c for c in loaded if c.get("caseId") in quick_ids]
            if filtered:
                loaded = filtered

        if max_cases is not None and max_cases > 0:
            loaded = loaded[:max_cases]

        return loaded

    def _build_evaluators(self, use_live_llm: bool = False) -> Dict[str, Any]:
        return {
            "rag": RAGEvaluator(use_live_llm=use_live_llm),
            "multimodal": MultimodalEvaluator(),
            "knowledge_graph": GraphEvaluator(),
            "assessment": AssessmentEvaluator(),
            "grading": GradingEvaluator(use_live_llm=use_live_llm),
            "learner_model": LearnerModelEvaluator(),
            "adaptive_tutor": AdaptiveTutorEvaluator(),
            "study_intelligence": StudyIntelligenceEvaluator(),
            "security": SecurityEvaluator(use_live_llm=use_live_llm),
        }

    def estimate_run_cost(
        self,
        run_type: str = "quick_suite",
        categories: Optional[List[str]] = None,
        max_cases: Optional[int] = None,
        use_live_llm: bool = False,
    ) -> Dict[str, Any]:
        cases = self.load_cases(run_type=run_type, categories=categories, max_cases=max_cases)
        llm_cases = sum(1 for c in cases if c.get("category") in ("rag", "grading", "security"))
        estimated_calls = llm_cases * 2 if use_live_llm else 0
        estimated_cost_usd = round(estimated_calls * 0.00025, 5)
        return {
            "runType": run_type,
            "caseCount": len(cases),
            "useLiveLlm": use_live_llm,
            "estimatedLlmCalls": estimated_calls,
            "estimatedCostUsd": estimated_cost_usd,
        }

    def run_evaluation(
        self,
        run_type: str = "quick_suite",
        course_id: Optional[str] = None,
        categories: Optional[List[str]] = None,
        max_cases: Optional[int] = None,
        use_live_llm: bool = False,
        baseline_run_id: Optional[str] = None,
        custom_thresholds: Optional[Dict[str, float]] = None,
        external_run_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Executes a complete isolated evaluation run synchronously and stores JSON artifact."""
        run_id = external_run_id or f"eval_{uuid.uuid4().hex[:12]}"
        started_ms = int(time.time() * 1000)
        judge_mode = "live_llm" if use_live_llm else "deterministic_offline"
        version_meta = get_version_metadata(judge_mode=judge_mode)
        fixtures = self.load_fixtures()
        cases = self.load_cases(run_type=run_type, categories=categories, max_cases=max_cases)
        evaluators = self._build_evaluators(use_live_llm=use_live_llm)

        with _RUNS_LOCK:
            _ACTIVE_RUNS[run_id] = {
                "runId": run_id,
                "status": "running",
                "progress": 0,
                "caseCount": len(cases),
                "completedCases": 0,
            }

        # Group cases by category while preserving order
        by_cat: Dict[str, List[Dict[str, Any]]] = {}
        for c in cases:
            by_cat.setdefault(c["category"], []).append(c)

        all_results: List[Dict[str, Any]] = []
        completed = 0

        try:
            for cat, cat_cases in by_cat.items():
                evaluator = evaluators.get(cat)
                if not evaluator:
                    continue
                cat_res = evaluator.evaluate_cases(cat_cases, fixtures, config={"courseId": course_id})
                for r in cat_res:
                    all_results.append(r.to_dict())
                completed += len(cat_cases)
                pct = int(round((completed / max(1, len(cases))) * 100))
                with _RUNS_LOCK:
                    if run_id in _ACTIVE_RUNS:
                        _ACTIVE_RUNS[run_id]["progress"] = pct
                        _ACTIVE_RUNS[run_id]["completedCases"] = completed

            aggregated = MetricsAggregator.aggregate(all_results)
            release_gate = RegressionEvaluator.evaluate_release_gate(
                all_results, aggregated["metrics"], thresholds=custom_thresholds
            )

            baseline_comparison = None
            if baseline_run_id:
                base_run = self.get_run(baseline_run_id)
                if base_run and base_run.get("metrics"):
                    baseline_comparison = RegressionEvaluator.compare_runs(
                        aggregated["metrics"], base_run["metrics"]
                    )

            completed_ms = int(time.time() * 1000)
            payload = {
                "runId": run_id,
                "runType": run_type,
                "courseId": course_id or fixtures.get("courseId"),
                "status": "completed",
                "progress": 100,
                "datasetVersion": version_meta["datasetVersion"],
                "evaluatorVersion": version_meta["evaluatorVersion"],
                "modelVersion": version_meta["modelVersion"],
                "promptVersions": version_meta["promptVersions"],
                "runConfig": {
                    "categories": categories or list(by_cat.keys()),
                    "maxCases": max_cases,
                    "useLiveLlm": use_live_llm,
                    "judgeMode": judge_mode,
                    "isolatedMode": True,
                    "optionalLibraries": version_meta["optionalLibraries"],
                    "retrievalConfig": version_meta["retrievalConfig"],
                },
                "startedAt": started_ms,
                "completedAt": completed_ms,
                "caseCount": aggregated["caseCount"],
                "passedCount": aggregated["passedCount"],
                "failedCount": aggregated["failedCount"],
                "overallPassRate": aggregated["overallPassRate"],
                "latencyStats": aggregated["latencyStats"],
                "usageStats": aggregated["usageStats"],
                "failureStats": aggregated["failureStats"],
                "releaseGate": release_gate,
                "baselineRunId": baseline_run_id,
                "baselineComparison": baseline_comparison,
                "cases": cases,
                "results": all_results,
                "metrics": aggregated["metrics"],
            }

            with _RUNS_LOCK:
                _ACTIVE_RUNS[run_id] = {
                    "runId": run_id,
                    "status": "completed",
                    "progress": 100,
                    "caseCount": aggregated["caseCount"],
                    "completedCases": aggregated["caseCount"],
                }

            self._persist_run(payload)
            return payload

        except Exception as exc:
            with _RUNS_LOCK:
                if run_id in _ACTIVE_RUNS:
                    _ACTIVE_RUNS[run_id]["status"] = "failed"
                    _ACTIVE_RUNS[run_id]["error"] = str(exc)
            raise

    def start_async_evaluation(self, **kwargs) -> Dict[str, Any]:
        run_id = kwargs.get("external_run_id") or f"eval_{uuid.uuid4().hex[:12]}"
        kwargs["external_run_id"] = run_id
        with _RUNS_LOCK:
            _ACTIVE_RUNS[run_id] = {
                "runId": run_id,
                "status": "queued",
                "progress": 0,
                "caseCount": 0,
                "completedCases": 0,
            }
        thread = threading.Thread(target=self.run_evaluation, kwargs=kwargs, daemon=True)
        thread.start()
        return _ACTIVE_RUNS[run_id]

    def get_live_status(self, run_id: str) -> Optional[Dict[str, Any]]:
        with _RUNS_LOCK:
            if run_id in _ACTIVE_RUNS:
                return dict(_ACTIVE_RUNS[run_id])
        saved = self.get_run(run_id)
        if saved:
            return {
                "runId": run_id,
                "status": saved.get("status", "completed"),
                "progress": saved.get("progress", 100),
                "caseCount": saved.get("caseCount", 0),
                "completedCases": saved.get("caseCount", 0),
            }
        return None

    def _persist_run(self, payload: Dict[str, Any]) -> None:
        out_path = self.runs_dir / f"{payload['runId']}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        path = self.runs_dir / f"{run_id}.json"
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def list_runs(self) -> List[Dict[str, Any]]:
        runs = []
        for p in sorted(self.runs_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                runs.append({k: v for k, v in data.items() if k not in ("cases", "results")})
            except Exception:
                continue
        return runs

    @staticmethod
    def render_markdown_report(run_data: Dict[str, Any]) -> str:
        rg = run_data.get("releaseGate") or {}
        lat = run_data.get("latencyStats") or {}
        usage = run_data.get("usageStats") or {}
        lines = [
            f"# Cognivue AI Evaluation Report — {run_data.get('runId')}",
            "",
            f"- **Run Type**: `{run_data.get('runType')}`",
            f"- **Dataset Version**: `{run_data.get('datasetVersion')}`",
            f"- **Evaluator Version**: `{run_data.get('evaluatorVersion')}`",
            f"- **Model Version**: `{run_data.get('modelVersion')}`",
            f"- **Judge Mode**: `{run_data.get('runConfig', {}).get('judgeMode')}`",
            f"- **Release Gate**: **{rg.get('status', 'UNKNOWN')}** (Critical failures: {rg.get('criticalFailureCount', 0)})",
            "",
            "## Summary",
            f"- **Total Cases**: {run_data.get('caseCount', 0)}",
            f"- **Passed**: {run_data.get('passedCount', 0)}",
            f"- **Failed**: {run_data.get('failedCount', 0)}",
            f"- **Overall Pass Rate**: {round(float(run_data.get('overallPassRate', 0.0)) * 100, 2)}%",
            f"- **Latency (p50 / p95 / max)**: {lat.get('p50Ms', 0)} ms / {lat.get('p95Ms', 0)} ms / {lat.get('maxMs', 0)} ms",
            f"- **Judge Calls / Est. Cost**: {usage.get('judgeCalls', 0)} calls / ${usage.get('estimatedCostUsd', 0.0)}",
            "",
            "## Category & Subsystem Metrics",
            "| Category | Metric | Value | Numerator / Denominator |",
            "| :--- | :--- | :--- | :--- |",
        ]

        for m in run_data.get("metrics", []):
            num = m.get("numerator")
            den = m.get("denominator")
            ratio = f"{num} / {den}" if num is not None and den is not None else "—"
            val_pct = f"{round(float(m['value']) * 100, 2)}%" if "Mae" not in m["metricName"] else f"{m['value']}"
            lines.append(f"| {m['category']} | `{m['metricName']}` | {val_pct} | {ratio} |")

        if rg.get("blockers"):
            lines.extend(["", "## Release Gate Blockers"])
            for b in rg["blockers"]:
                lines.append(f"- {b}")

        failed_cases = [r for r in run_data.get("results", []) if not r.get("passed")]
        lines.extend(["", f"## Failed Cases ({len(failed_cases)})"])
        if not failed_cases:
            lines.append("- None. All evaluated cases passed.")
        else:
            for fc in failed_cases:
                lines.append(f"- **{fc['caseId']}** ({fc['category']}): {'; '.join(fc.get('failureReasons', []))}")

        return "\n".join(lines) + "\n"
