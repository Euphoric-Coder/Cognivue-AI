from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

class CreateAssessmentRequest(BaseModel):
    courseId: str
    userId: Optional[str] = None
    title: str
    description: Optional[str] = ""
    assessmentType: str = "topic_quiz"  # "practice" | "topic_quiz" | "mixed_quiz" | "mock_exam"
    selectedConceptIds: Optional[List[str]] = []
    difficulty: str = "mixed"  # "easy" | "medium" | "hard" | "mixed"
    questionCount: int = 10
    questionTypeConfig: Optional[List[str]] = ["mcq", "multiple_select", "true_false", "short_answer"]
    timeLimitMinutes: Optional[int] = None
    shuffleQuestions: Optional[bool] = False
    shuffleOptions: Optional[bool] = False

class RegenerateQuestionRequest(BaseModel):
    courseId: str
    assessmentId: str
    questionId: str
    conceptId: Optional[str] = None
    difficulty: Optional[str] = None
    questionType: Optional[str] = None

class GradeSubjectiveRequest(BaseModel):
    courseId: str
    questionId: str
    studentAnswer: str
    referenceAnswer: Optional[str] = None
    requiredKeyPoints: Optional[List[str]] = []
    optionalKeyPoints: Optional[List[str]] = []
    misconceptionIndicators: Optional[List[str]] = []
    rubric: Optional[List[Dict[str, Any]]] = []
    sourceEvidence: Optional[List[Dict[str, Any]]] = []
    maxPoints: Optional[float] = 1.0

class SubjectiveGradingResult(BaseModel):
    scoreFraction: float
    awardedPoints: float
    maxPoints: float
    isCorrect: bool
    matchedKeyPoints: List[str] = []
    missingKeyPoints: List[str] = []
    incorrectClaims: List[str] = []
    feedback: str
