"""
FastAPI Router for Cognivue AI Version 10: Personal Study Intelligence.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
import logging

from app.schemas.study_intelligence import (
    RecomputeRecommendationsRequest,
    GenerateStudyPlanRequest,
    RebuildStudyPlanRequest,
    CompleteStudyItemRequest,
    RecordReviewEventRequest,
)
from app.services.study_intelligence import StudyIntelligenceService

logger = logging.getLogger(__name__)

router = APIRouter()
study_service = StudyIntelligenceService()


@router.get("/recommendations/{course_id}")
async def get_study_recommendations(course_id: str, user_id: Optional[str] = None):
    try:
        result = study_service.recompute_study_recommendations(
            course_id=course_id,
            user_id=user_id,
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching study recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recompute")
async def recompute_recommendations(req: RecomputeRecommendationsRequest):
    try:
        result = study_service.recompute_study_recommendations(
            course_id=req.courseId,
            user_id=req.userId,
            exam_target_date=req.examTargetDate,
        )
        return result
    except Exception as e:
        logger.error(f"Error recomputing study recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/study-plan/generate")
async def generate_study_plan(req: GenerateStudyPlanRequest):
    try:
        result = study_service.generate_study_plan(
            course_id=req.courseId,
            user_id=req.userId or "default_user",
            plan_type=req.planType,
            daily_minutes=req.dailyMinutes,
            preferred_days=req.preferredStudyDays,
            target_date=req.targetDate,
            today_date_str=req.todayDate,
        )
        return result
    except Exception as e:
        logger.error(f"Error generating study plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/study-plan/rebuild")
async def rebuild_study_plan(req: RebuildStudyPlanRequest):
    try:
        # Rebalances pending items from past dates to today without duplicates
        if study_service.convex_client:
            res = study_service.convex_client.mutation(
                "studyIntelligence:rebalanceStudyPlan",
                {
                    "studyPlanId": req.studyPlanId,
                    "todayDate": req.todayDate,
                }
            )
            return res
        return {"success": True, "rebalanced": True}
    except Exception as e:
        logger.error(f"Error rebuilding study plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/study-plan/item/complete")
async def complete_study_plan_item(req: CompleteStudyItemRequest):
    try:
        result = study_service.complete_study_item(
            item_id=req.itemId,
            user_id=req.userId or "default_user",
            duration_seconds=req.durationSeconds,
        )
        return result
    except Exception as e:
        logger.error(f"Error completing study item: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/review-event")
async def record_review_event(req: RecordReviewEventRequest):
    try:
        result = study_service.record_review_event(
            course_id=req.courseId,
            user_id=req.userId or "default_user",
            concept_id=req.conceptId,
            outcome=req.outcome,
        )
        return result
    except Exception as e:
        logger.error(f"Error recording review event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/diagnostics/{course_id}")
async def get_study_diagnostics(course_id: str, user_id: Optional[str] = None):
    try:
        res = study_service.recompute_study_recommendations(
            course_id=course_id,
            user_id=user_id,
        )
        return {
            "courseId": course_id,
            "totalConcepts": res.get("count", 0),
            "diagnostics": [
                {
                    "conceptName": r.get("conceptName"),
                    "priorityScore": r.get("priorityScore"),
                    "priorityBand": r.get("priorityBand"),
                    "reasonCodes": r.get("reasonCodes"),
                    "diagnostics": r.get("diagnostics"),
                }
                for r in res.get("recommendations", [])
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching study diagnostics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

