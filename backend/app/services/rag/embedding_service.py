import logging
from typing import List
from google import genai
from app.config import settings

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        if settings.gemini_api_key:
            self.client = genai.Client(api_key=settings.gemini_api_key)
        else:
            self.client = None
            logger.warning("No GEMINI_API_KEY set. Embeddings will fail.")

    def embed_text(self, text: str) -> List[float]:
        if not self.client:
            raise ValueError("Embedding client is not configured (missing API key).")
            
        result = self.client.models.embed_content(
            model=settings.embedding_model,
            contents=text
        )
        return result.embeddings[0].values

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if not self.client:
            raise ValueError("Embedding client is not configured.")
            
        result = self.client.models.embed_content(
            model=settings.embedding_model,
            contents=texts
        )
        return [emb.values for emb in result.embeddings]
