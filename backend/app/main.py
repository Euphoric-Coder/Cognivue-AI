import os
import uuid
import time
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import (
    ingestion,
    tutor,
    knowledge_graph,
    assessment,
    learner_model,
    study_intelligence,
    evaluation,
)

app = FastAPI(
    title="Cognivue AI Backend",
    description="Multimodal Learning Engine powering source ingestion, knowledge graphs, grounded tutoring, assessments, learner modeling, and personal study intelligence.",
    version="12.0.0",
)

# Configurable CORS
raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
if raw_origins.strip() == "*":
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-request-id", "x-response-time-ms"],
)

# Request ID & Latency Tracking Middleware
@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    start_time = time.time()
    
    response: Response = await call_next(request)
    
    duration_ms = round((time.time() - start_time) * 1000, 2)
    response.headers["x-request-id"] = request_id
    response.headers["x-response-time-ms"] = str(duration_ms)
    return response

# Routers
app.include_router(ingestion.router, prefix="/api/ingestion", tags=["Ingestion"])
app.include_router(tutor.router, prefix="/api/tutor", tags=["Tutor"])
app.include_router(knowledge_graph.router, prefix="/api/knowledge-graph", tags=["Knowledge Graph"])
app.include_router(assessment.router, prefix="/api/assessment", tags=["Assessment"])
app.include_router(learner_model.router, prefix="/api/learner-model", tags=["Learner Model"])
app.include_router(study_intelligence.router, prefix="/api/study-intelligence", tags=["Study Intelligence"])
app.include_router(evaluation.router, prefix="/api/evaluation", tags=["Evaluation & Benchmarking"])

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "12.0.0",
        "release": "v12_hackathon_final",
        "models": {
            "llm": settings.llm_model,
            "embedding": settings.embedding_model,
            "vision": settings.vision_model,
        },
        "services": {
            "geminiConfigured": bool(settings.gemini_api_key),
            "convexConfigured": bool(settings.convex_url),
        },
    }

@app.get("/")
async def root():
    return {
        "service": "Cognivue AI Multimodal Learning Engine",
        "version": "12.0.0",
        "status": "online",
        "docs": "/docs",
    }
