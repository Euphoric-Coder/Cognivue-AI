from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class TutorAskRequest(BaseModel):
    courseId: str
    sessionId: str
    userId: str
    question: str
    tutorMode: Optional[str] = "adaptive"
    activeHintLevel: Optional[int] = None
    focusConceptId: Optional[str] = None
    reviewQuestionId: Optional[str] = None
    reviewResponseId: Optional[str] = None

class Citation(BaseModel):
    sourceId: str
    sourceChunkId: str
    sourceName: str
    locationType: str
    pageNumber: Optional[int] = None
    slideNumber: Optional[int] = None
    startTime: Optional[float] = None
    endTime: Optional[float] = None
    evidenceType: Optional[str] = "text"
    visualType: Optional[str] = None
    sourceVisualId: Optional[str] = None
    imageUrl: Optional[str] = None
    confidenceNotes: Optional[List[str]] = None
    sectionTitle: Optional[str] = None
    excerpt: Optional[str] = None

class TutorAdaptationMetadata(BaseModel):
    conceptId: Optional[str] = None
    conceptName: Optional[str] = None
    masteryBand: Optional[str] = None
    masteryPercentage: Optional[int] = None
    confidence: Optional[str] = None
    tutorMode: Optional[str] = None
    pedagogyStrategy: Optional[str] = None
    prerequisiteIntervention: Optional[bool] = None
    weakPrerequisiteName: Optional[str] = None
    misconceptionAddressed: Optional[str] = None
    hintLevel: Optional[int] = None
    whyThisApproach: Optional[str] = None
    followUpSuggestions: Optional[List[str]] = None

class TutorAskResponse(BaseModel):
    answer: str
    grounded: bool
    citations: List[Citation]
    retrievalStatus: str
    adaptation: Optional[TutorAdaptationMetadata] = None

class EmbedSourceRequest(BaseModel):
    sourceId: str
    courseId: str
