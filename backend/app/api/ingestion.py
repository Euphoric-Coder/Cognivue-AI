from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from app.schemas.ingestion import IngestionRequest, IngestionResponse
from app.services.ingestion_service import process_source
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
