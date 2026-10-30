import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException
from typing import Dict, Any
from app.schemas.assessment import (
    CreateAssessmentRequest,
    RegenerateQuestionRequest,
    GradeSubjectiveRequest,
    SubjectiveGradingResult
)
from app.services.assessment.assessment_service import AssessmentService
from app.services.assessment.grading_service import GradingService

logger = logging.getLogger(__name__)
router = APIRouter()
assessment_service = AssessmentService()
grading_service = GradingService()

def run_generate_task(
    assessment_id: str,
    course_id: str,
    user_id: str,
    title: str,
    assessment_type: str,
    selected_concept_ids: list,
    difficulty: str,
    question_count: int,
    question_types: list
):
    try:
        assessment_service.generate_assessment(
            assessment_id=assessment_id,
            course_id=course_id,
            user_id=user_id,
            title=title,
            assessment_type=assessment_type,
            selected_concept_ids=selected_concept_ids,
            difficulty=difficulty,
            question_count=question_count,
            question_types=question_types
        )
    except Exception as e:
        logger.error(f"Background assessment generation failed: {e}", exc_info=True)

@router.post("/generate")
async def generate_assessment_endpoint(
    req: Dict[str, Any],
    background_tasks: BackgroundTasks
):
    try:
        assessment_id = req.get("assessmentId")
        course_id = req.get("courseId")
        if not assessment_id or not course_id:
            raise HTTPException(status_code=400, detail="assessmentId and courseId are required.")

        user_id = req.get("userId")
        title = req.get("title", "Assessment")
        assessment_type = req.get("assessmentType", "topic_quiz")
        selected_concept_ids = req.get("selectedConceptIds", [])
        difficulty = req.get("difficulty", "mixed")
        question_count = int(req.get("questionCount", 10))
        question_types = req.get("questionTypeConfig", ["mcq", "multiple_select", "true_false", "short_answer"])

        background_tasks.add_task(
            run_generate_task,
            assessment_id,
            course_id,
            user_id,
            title,
            assessment_type,
            selected_concept_ids,
            difficulty,
            question_count,
            question_types
        )

        return {
            "status": "generating",
            "message": "Assessment generation started in background.",
            "assessmentId": assessment_id,
            "courseId": course_id
        }
    except Exception as e:
        logger.error(f"Error starting assessment generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/regenerate-question")
async def regenerate_question_endpoint(req: RegenerateQuestionRequest):
    try:
        res = assessment_service.regenerate_single_question(
            assessment_id=req.assessmentId,
            question_id=req.questionId,
            course_id=req.courseId,
            concept_id=req.conceptId,
            difficulty=req.difficulty,
            question_type=req.questionType
        )
        return res
    except Exception as e:
        logger.error(f"Error regenerating question: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/grade-subjective", response_model=SubjectiveGradingResult)
async def grade_subjective_endpoint(req: GradeSubjectiveRequest):
    try:
        evidence_excerpts = [e.get("excerpt", "") for e in (req.sourceEvidence or []) if e.get("excerpt")]
        result = grading_service.grade_subjective_question(
            question_text="",
            student_answer=req.studentAnswer,
            reference_answer=req.referenceAnswer,
            required_key_points=req.requiredKeyPoints,
            optional_key_points=req.optionalKeyPoints,
            misconception_indicators=req.misconceptionIndicators,
            rubric=req.rubric,
            evidence_excerpts=evidence_excerpts,
            max_points=req.maxPoints or 1.0
        )
        return SubjectiveGradingResult(
            scoreFraction=result.get("scoreFraction", 0.0),
            awardedPoints=result.get("awardedPoints", 0.0),
            maxPoints=result.get("maxPoints", req.maxPoints or 1.0),
            isCorrect=result.get("isCorrect", False),
            matchedKeyPoints=result.get("matchedKeyPoints", []),
            missingKeyPoints=result.get("missingKeyPoints", []),
            incorrectClaims=result.get("incorrectClaims", []),
            feedback=result.get("feedback", "Evaluation complete.")
        )
    except Exception as e:
        logger.error(f"Error in subjective grading endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
