import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.schemas.knowledge_graph import BuildKnowledgeGraphRequest, BuildKnowledgeGraphResponse
from app.services.knowledge_graph.graph_builder import KnowledgeGraphBuilder

logger = logging.getLogger(__name__)
router = APIRouter()
graph_builder = KnowledgeGraphBuilder()

def run_build_task(course_id: str, user_id: str, force_rebuild: bool):
    try:
        graph_builder.build_course_knowledge_graph(course_id, user_id, force_rebuild)
    except Exception as e:
        logger.error(f"Background Knowledge Graph Build Failed: {e}", exc_info=True)

@router.post("/build", response_model=BuildKnowledgeGraphResponse)
async def build_knowledge_graph(req: BuildKnowledgeGraphRequest, background_tasks: BackgroundTasks):
    try:
        # Schedule build in background
        background_tasks.add_task(run_build_task, req.courseId, req.userId, req.forceRebuild or False)
        return BuildKnowledgeGraphResponse(
            status="building",
            message="Knowledge graph construction has started.",
            courseId=req.courseId
        )
    except Exception as e:
        logger.error(f"Error starting knowledge graph build: {e}")
        raise HTTPException(status_code=500, detail=str(e))
