from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional


class RunEvaluationRequest(BaseModel):
    runType: str = Field(default="quick_suite", description="quick_suite | full_suite | rag | multimodal | knowledge_graph | assessment | grading | learner_model | adaptive_tutor | study_intelligence | security")
    courseId: Optional[str] = None
    categories: Optional[List[str]] = None
    maxCases: Optional[int] = Field(default=None, ge=1, le=500)
    useLiveLlm: bool = False
    baselineRunId: Optional[str] = None
    customThresholds: Optional[Dict[str, float]] = None
    asyncMode: bool = False
    externalRunId: Optional[str] = None


class EstimateCostRequest(BaseModel):
    runType: str = "quick_suite"
    categories: Optional[List[str]] = None
    maxCases: Optional[int] = Field(default=None, ge=1, le=500)
    useLiveLlm: bool = False


class CompareRunsRequest(BaseModel):
    currentRunId: Optional[str] = None
    baselineRunId: Optional[str] = None
    currentMetrics: Optional[List[Dict[str, Any]]] = None
    baselineMetrics: Optional[List[Dict[str, Any]]] = None
    regressionTolerance: float = -0.02

