from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class TutorAskRequest(BaseModel):
    courseId: str
    sessionId: str
    userId: str
    question: str

class Citation(BaseModel):
    sourceId: str
    sourceChunkId: str
    sourceName: str
    locationType: str
    pageNumber: Optional[int] = None
    slideNumber: Optional[int] = None
    sectionTitle: Optional[str] = None
    excerpt: Optional[str] = None

class TutorAskResponse(BaseModel):
    answer: str
    grounded: bool
    citations: List[Citation]
    retrievalStatus: str

class EmbedSourceRequest(BaseModel):
    sourceId: str
    courseId: str
