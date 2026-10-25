import os
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Settings(BaseSettings):
    ingestion_api_secret: str = os.getenv("INGESTION_API_SECRET", "secret-dev-key")
    convex_url: str = os.getenv("NEXT_PUBLIC_CONVEX_URL", "https://effervescent-ocelot-139.convex.cloud")
    convex_site_url: str = os.getenv("CONVEX_SITE_URL", "https://effervescent-ocelot-139.convex.site")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "gemini-embedding-2")
    llm_model: str = os.getenv("LLM_MODEL", "gemini-3.6-flash")
    vision_model: str = os.getenv("VISION_MODEL", "gemini-2.5-flash")
    rag_top_k: int = int(os.getenv("RAG_TOP_K", "8"))
    rag_final_context_count: int = int(os.getenv("RAG_FINAL_CONTEXT_COUNT", "5"))

    # V5 Visual Processing Limits
    visual_max_per_source: int = int(os.getenv("VISUAL_MAX_PER_SOURCE", "25"))
    video_max_keyframes: int = int(os.getenv("VIDEO_MAX_KEYFRAMES", "15"))
    visual_min_width: int = int(os.getenv("VISUAL_MIN_WIDTH", "100"))
    visual_min_height: int = int(os.getenv("VISUAL_MIN_HEIGHT", "100"))

    model_config = SettingsConfigDict(
        env_file=[os.path.join(BASE_DIR, ".env"), ".env", os.path.join(BASE_DIR, "..", ".env.local")],
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
