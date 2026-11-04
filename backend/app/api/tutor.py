from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.schemas.tutor import TutorAskRequest, TutorAskResponse, EmbedSourceRequest
from app.services.rag.rag_service import RAGService
from app.services.adaptive_tutor import AdaptiveTutorService
import logging

router = APIRouter()
logger = logging.getLogger(__name__)
rag_service = RAGService()
adaptive_tutor_service = AdaptiveTutorService(rag_service.convex_client)

@router.post("/ask", response_model=TutorAskResponse)
async def ask_tutor(req: TutorAskRequest):
    try:
        result = adaptive_tutor_service.ask_adaptive_tutor(
            course_id=req.courseId,
            session_id=req.sessionId,
            user_id=req.userId,
            question=req.question,
            tutor_mode=req.tutorMode or "adaptive",
            active_hint_level=req.activeHintLevel,
            focus_concept_id=req.focusConceptId,
            review_question_id=req.reviewQuestionId,
            review_response_id=req.reviewResponseId,
        )
        return TutorAskResponse(**result)
    except Exception as e:
        logger.error(f"Adaptive Tutor execution failed, engaging fallback: {e}")
        # Safe fallback to standard grounded RAG
        try:
            result = rag_service.ask_tutor(req.courseId, req.sessionId, req.userId, req.question)
            return TutorAskResponse(**result)
        except Exception as fe:
            logger.error(f"Fallback RAG failed as well: {fe}")
            raise HTTPException(status_code=500, detail=str(e))

@router.post("/embed")
async def embed_source(req: EmbedSourceRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(rag_service.embed_source, req.sourceId, req.courseId)
    return {"status": "embedding_started"}
