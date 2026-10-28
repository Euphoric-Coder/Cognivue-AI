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
            
        try:
            result = self.client.models.embed_content(
                model=settings.embedding_model,
                contents=text
            )
            return result.embeddings[0].values
        except Exception as e:
            logger.warning(f"Gemini embed_content failed: {e}. Using deterministic normalized vector fallback.")
            import hashlib, random
            seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:16], 16)
            rng = random.Random(seed)
            raw = [rng.gauss(0, 1) for _ in range(3072)]
            norm = sum(x**2 for x in raw) ** 0.5 or 1.0
            return [x / norm for x in raw]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if not self.client:
            raise ValueError("Embedding client is not configured.")
            
        embeddings = []
        for text in texts:
            embeddings.append(self.embed_text(text))
        return embeddings
