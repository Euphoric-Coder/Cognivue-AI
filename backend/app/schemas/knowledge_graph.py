from pydantic import BaseModel
from typing import Optional

class BuildKnowledgeGraphRequest(BaseModel):
    courseId: str
    userId: str
    forceRebuild: Optional[bool] = False

class BuildKnowledgeGraphResponse(BaseModel):
    status: str
    message: str
    courseId: str
