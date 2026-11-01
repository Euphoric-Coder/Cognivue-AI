"""
Learner Model API: Exposes course-level and concept-level learner state,
recomputation triggers, and development diagnostics.
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Header
from app.services.learner_model.learner_model_service import LearnerModelService

logger = logging.getLogger(__name__)
router = APIRouter()
learner_model_service = LearnerModelService()


@router.get("/course/{course_id}")
async def get_course_progress(
    course_id: str,
):
    """
    Returns overall course mastery, assessment coverage, mastery band distribution,
    and historical progress snapshots.
    """
    try:
        data = learner_model_service.get_course_learner_summary(course_id)
        if not data:
            raise HTTPException(status_code=404, detail="Course learner model summary not found.")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching course learner summary for {course_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/concept/{concept_id}")
async def get_concept_progress(
    concept_id: str,
    course_id: str = Query(..., alias="courseId"),
):
    """
    Returns concept-level mastery probability, confidence level, trend,
    observation history, and deterministic 'Why this score?' explanation.
    """
    try:
        data = learner_model_service.get_concept_learner_details(course_id, concept_id)
        if not data:
            raise HTTPException(status_code=404, detail="Concept learner details not found.")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching concept learner details for {concept_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recompute")
async def recompute_learner_model(
    payload: Dict[str, Any]
):
    """
    Idempotently reprocesses historical graded attempts for a course to refresh
    learner observations, concept states, and mastery snapshots.
    """
    course_id = payload.get("courseId")
    if not course_id:
        raise HTTPException(status_code=400, detail="courseId is required.")

    user_id = payload.get("userId")

    try:
        result = learner_model_service.recompute_course_learner_model(course_id, user_id)
        return result
    except Exception as e:
        logger.error(f"Error recomputing learner model for {course_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/diagnostics/{course_id}/{concept_id}")
async def get_concept_diagnostics(
    course_id: str,
    concept_id: str,
):
    """
    Development-only diagnostics revealing raw weights, decay factors, and formula components.
    """
    try:
        diagnostics = learner_model_service.get_diagnostics(course_id, concept_id)
        return diagnostics
    except Exception as e:
        logger.error(f"Error generating diagnostics for {concept_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
