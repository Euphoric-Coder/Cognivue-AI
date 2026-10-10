from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.schemas.tutor import TutorAskRequest, TutorAskResponse, EmbedSourceRequest
from app.services.rag.rag_service import RAGService
import logging

router = APIRouter()
logger = logging.getLogger(__name__)
rag_service = RAGService()

@router.post("/ask", response_model=TutorAskResponse)
async def ask_tutor(req: TutorAskRequest):
    try:
        result = rag_service.ask_tutor(req.courseId, req.sessionId, req.userId, req.question)
        return TutorAskResponse(**result)
    except Exception as e:
        logger.error(f"Ask Tutor Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/embed")
async def embed_source(req: EmbedSourceRequest, background_tasks: BackgroundTasks):
    # Fire and forget embedding generation
    background_tasks.add_task(rag_service.embed_source, req.sourceId, req.courseId)
    return {"status": "embedding_started"}
