from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from app.schemas.ingestion import IngestionRequest, IngestionResponse, RebuildIndexRequest
from app.services.ingestion_service import process_source, rebuild_video_index_task
from app.config import settings

router = APIRouter()

@router.post("/process", response_model=IngestionResponse)
async def trigger_ingestion(
    request: IngestionRequest,
    background_tasks: BackgroundTasks,
    x_ingestion_secret: str = Header(None)
):
    if x_ingestion_secret != settings.ingestion_api_secret:
        raise HTTPException(status_code=401, detail="Unauthorized ingestion call")

    # Start processing in the background so we don't block the HTTP response
    background_tasks.add_task(process_source, request)

    return IngestionResponse(
        success=True,
        sourceId=request.sourceId,
        status="queued"
    )

@router.post("/rebuild_video_index", response_model=IngestionResponse)
async def rebuild_video_index(
    request: RebuildIndexRequest,
    background_tasks: BackgroundTasks,
    x_ingestion_secret: str = Header(None)
):
    if x_ingestion_secret != settings.ingestion_api_secret:
        raise HTTPException(status_code=401, detail="Unauthorized ingestion call")

    background_tasks.add_task(rebuild_video_index_task, request.sourceId, request.courseId)
    
    return IngestionResponse(
        success=True,
        sourceId=request.sourceId,
        status="queued"
    )

@router.post("/reprocess_visuals", response_model=IngestionResponse)
async def reprocess_visuals(
    request: RebuildIndexRequest,
    background_tasks: BackgroundTasks,
    x_ingestion_secret: str = Header(None)
):
    if x_ingestion_secret != settings.ingestion_api_secret:
        raise HTTPException(status_code=401, detail="Unauthorized ingestion call")

    from app.services.ingestion_service import reprocess_visuals_task
    background_tasks.add_task(reprocess_visuals_task, request.sourceId, request.courseId)

    return IngestionResponse(
        success=True,
        sourceId=request.sourceId,
        status="queued"
    )
