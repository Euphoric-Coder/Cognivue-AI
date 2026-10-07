import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    ingestion_api_secret: str = os.getenv("INGESTION_API_SECRET", "secret-dev-key")
    convex_url: str = os.getenv("NEXT_PUBLIC_CONVEX_URL", "https://effervescent-ocelot-139.convex.site")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
