import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ingestion_api_secret: str = os.getenv("INGESTION_API_SECRET", "secret-dev-key")
    convex_url: str = os.getenv("NEXT_PUBLIC_CONVEX_URL", "https://effervescent-ocelot-139.convex.cloud")
    convex_site_url: str = os.getenv("CONVEX_SITE_URL", "https://effervescent-ocelot-139.convex.site")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "gemini-embedding-2")
    llm_model: str = os.getenv("LLM_MODEL", "gemini-2.5-flash")
    rag_top_k: int = int(os.getenv("RAG_TOP_K", "8"))
    rag_final_context_count: int = int(os.getenv("RAG_FINAL_CONTEXT_COUNT", "5"))

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
