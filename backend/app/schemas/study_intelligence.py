from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class RecomputeRecommendationsRequest(BaseModel):
    courseId: str
    userId: Optional[str] = None
    examTargetDate: Optional[str] = None

class GenerateStudyPlanRequest(BaseModel):
    courseId: str
    userId: Optional[str] = None
    planType: str = "daily" # "daily" | "weekly" | "exam_preparation"
    dailyMinutes: int = 30
    preferredStudyDays: Optional[List[str]] = None
    targetDate: Optional[str] = None
    todayDate: Optional[str] = None

class RebuildStudyPlanRequest(BaseModel):
    studyPlanId: str
    courseId: str
    userId: Optional[str] = None
    todayDate: str

class CompleteStudyItemRequest(BaseModel):
    itemId: str
    userId: Optional[str] = None
    durationSeconds: Optional[int] = None

class RecordReviewEventRequest(BaseModel):
    courseId: str
    userId: Optional[str] = None
    conceptId: str
    outcome: str # "success" | "fail"

