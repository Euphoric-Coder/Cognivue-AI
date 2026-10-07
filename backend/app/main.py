from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from app.api import ingestion

app = FastAPI(title="Cognivue AI Ingestion Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Typically restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion.router, prefix="/api/ingestion", tags=["Ingestion"])

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {
        "message": "Welcome to the Cognivue AI Ingestion Service!",
        "docs": "Visit /docs for the API documentation."
    }
