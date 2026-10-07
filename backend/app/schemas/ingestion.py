from pydantic import BaseModel, Field
from typing import Optional, List

class IngestionRequest(BaseModel):
    sourceId: str
    courseId: str
    userId: str
    fileUrl: str
    mimeType: str
    originalFileName: str

class IngestionResponse(BaseModel):
    success: bool
    sourceId: str
    status: str
    chunksCreated: int = 0
