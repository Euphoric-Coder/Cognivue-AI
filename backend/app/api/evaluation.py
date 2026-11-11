"""
FastAPI Router for Cognivue AI Version 11: System Evaluation & Benchmarking.
Provides cost-guarded, isolated evaluation execution, progress tracking,
baseline comparisons, and downloadable JSON/Markdown reports.
Never auto-runs on application startup.
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse, JSONResponse
import logging

from app.schemas.evaluation import (
    RunEvaluationRequest,
    EstimateCostRequest,
    CompareRunsRequest,
)
from app.services.evaluation import EvaluationRunner, get_version_metadata
from app.services.evaluation.regression_evaluator import RegressionEvaluator

logger = logging.getLogger(__name__)

router = APIRouter()
eval_runner = EvaluationRunner()


@router.get("/metadata")
async def get_evaluation_metadata():
    manifest = eval_runner.load_manifest()
    meta = get_version_metadata(judge_mode="deterministic_offline")
    return {
        "metadata": meta,
        "manifest": manifest,
    }


@router.post("/estimate")
async def estimate_evaluation_cost(req: EstimateCostRequest):
    try:
        return eval_runner.estimate_run_cost(
            run_type=req.runType,
            categories=req.categories,
            max_cases=req.maxCases,
            use_live_llm=req.useLiveLlm,
        )
    except Exception as exc:
        logger.error(f"Cost estimation failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/run")
async def trigger_evaluation_run(req: RunEvaluationRequest):
    try:
        if req.asyncMode:
            status = eval_runner.start_async_evaluation(
                run_type=req.runType,
                course_id=req.courseId,
                categories=req.categories,
                max_cases=req.maxCases,
                use_live_llm=req.useLiveLlm,
                baseline_run_id=req.baselineRunId,
                custom_thresholds=req.customThresholds,
                external_run_id=req.externalRunId,
            )
            return status

        result = eval_runner.run_evaluation(
            run_type=req.runType,
            course_id=req.courseId,
            categories=req.categories,
            max_cases=req.maxCases,
            use_live_llm=req.useLiveLlm,
            baseline_run_id=req.baselineRunId,
            custom_thresholds=req.customThresholds,
            external_run_id=req.externalRunId,
        )
        return result
    except Exception as exc:
        logger.error(f"Evaluation run failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/runs")
async def list_evaluation_runs():
    return {"runs": eval_runner.list_runs()}


@router.get("/runs/{run_id}/status")
async def get_evaluation_run_status(run_id: str):
    status = eval_runner.get_live_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    return status


@router.get("/runs/{run_id}")
async def get_evaluation_run(run_id: str):
    run = eval_runner.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
    return run


@router.post("/compare")
async def compare_evaluation_runs(req: CompareRunsRequest):
    curr_metrics = req.currentMetrics
    base_metrics = req.baselineMetrics

    if req.currentRunId and curr_metrics is None:
        curr_run = eval_runner.get_run(req.currentRunId)
        if not curr_run:
            raise HTTPException(status_code=404, detail="Current run not found")
        curr_metrics = curr_run.get("metrics", [])

    if req.baselineRunId and base_metrics is None:
        base_run = eval_runner.get_run(req.baselineRunId)
        if not base_run:
            raise HTTPException(status_code=404, detail="Baseline run not found")
        base_metrics = base_run.get("metrics", [])

    if curr_metrics is None or base_metrics is None:
        raise HTTPException(status_code=400, detail="Provide current & baseline runs or metric arrays")

    return RegressionEvaluator.compare_runs(
        curr_metrics,
        base_metrics,
        regression_tolerance=req.regressionTolerance,
    )


@router.get("/runs/{run_id}/export")
async def export_evaluation_report(run_id: str, format: str = Query(default="json", pattern="^(json|markdown|md)$")):
    run = eval_runner.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    if format in ("markdown", "md"):
        md = EvaluationRunner.render_markdown_report(run)
        return PlainTextResponse(
            content=md,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="evaluation_report_{run_id}.md"'},
        )

    return JSONResponse(
        content=run,
        headers={"Content-Disposition": f'attachment; filename="evaluation_report_{run_id}.json"'},
    )

