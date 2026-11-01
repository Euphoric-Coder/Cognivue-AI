"""
Model configuration for Cognivue AI Version 8: Learner Model & Knowledge Tracing.
Centralizes all mastery, difficulty, recency, confidence, and readiness constants.
"""

MODEL_VERSION = "mastery-v1"

# Difficulty weights: calibrated to reward solving more challenging questions
# without allowing a single hard question to dominate completely.
DIFFICULTY_WEIGHTS = {
    "easy": 0.8,
    "medium": 1.0,
    "hard": 1.2
}

# Question type reliability factors: higher information from free-response & conceptual tasks
QUESTION_TYPE_WEIGHTS = {
    "true_false": 0.85,
    "mcq": 1.0,
    "multiple_select": 1.05,
    "numerical": 1.1,
    "short_answer": 1.15,
    "concept_explanation": 1.2
}

# Concept importance weights in course-level mastery aggregation
IMPORTANCE_WEIGHTS = {
    "core": 1.4,
    "supporting": 1.0,
    "minor": 0.6
}

# Recency decay parameters: smooth exponential decay with floor
RECENCY_HALF_LIFE_DAYS = 45.0
RECENCY_MIN_FACTOR = 0.60

# Minimum evidence thresholds
MIN_EVIDENCE_FOR_ESTIMATE = 3
MIN_EVIDENCE_FOR_STRONG = 5
MIN_EVIDENCE_FOR_TREND = 3

# Mastery bands (inclusive lower, exclusive upper except for 1.0)
MASTERY_BANDS = {
    "needs_attention": (0.0, 0.40),
    "developing": (0.40, 0.60),
    "proficient": (0.60, 0.80),
    "strong": (0.80, 1.01)
}

# Confidence thresholds
CONFIDENCE_THRESHOLDS = {
    "high": 0.70,
    "medium": 0.35,
    "low": 0.0
}

# Prerequisite readiness thresholds
PREREQUISITE_MIN_PROFICIENT = 0.60
PREREQUISITE_WEAK_THRESHOLD = 0.40
