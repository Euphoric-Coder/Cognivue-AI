"""
Version & Reproducibility Metadata for Cognivue AI Evaluation Framework (V11).
Tracks dataset, evaluator, model, prompt versions, and optional evaluation library availability.
"""

import importlib.util
from typing import Dict, Any
from app.config import settings

DATASET_VERSION = "cognivue-eval-v1"
EVALUATOR_VERSION = "eval-v1.0"

PROMPT_VERSIONS: Dict[str, str] = {
    "rag_grounded_tutor": "rag-prompt-v1",
    "adaptive_tutor": "adaptive-prompt-v2",
    "subjective_grader": "grader-prompt-v2",
    "question_generator": "assessment-gen-v1",
    "knowledge_graph_extractor": "kg-extract-v1",
    "llm_judge": "eval-judge-v1",
}


def detect_optional_eval_frameworks() -> Dict[str, bool]:
    """Detects whether external evaluation libraries (ragas, deepeval) are installed."""
    return {
        "ragasInstalled": importlib.util.find_spec("ragas") is not None,
        "deepevalInstalled": importlib.util.find_spec("deepeval") is not None,
    }


def get_version_metadata(judge_mode: str = "deterministic") -> Dict[str, Any]:
    """Returns full reproducibility metadata stamped onto every evaluationRun."""
    return {
        "datasetVersion": DATASET_VERSION,
        "evaluatorVersion": EVALUATOR_VERSION,
        "modelVersion": settings.llm_model,
        "embeddingModel": settings.embedding_model,
        "visionModel": settings.vision_model,
        "promptVersions": dict(PROMPT_VERSIONS),
        "judgeMode": judge_mode,
        "optionalLibraries": detect_optional_eval_frameworks(),
        "retrievalConfig": {
            "topK": settings.rag_top_k,
            "finalContextCount": settings.rag_final_context_count,
        },
    }

