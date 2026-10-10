import logging
import asyncio
import time
from typing import List, Dict, Any
from convex import ConvexClient
from app.config import settings
from app.services.rag.embedding_service import EmbeddingService
from app.services.rag.llm_service import LLMService

logger = logging.getLogger(__name__)

class RAGService:
    def __init__(self):
        self.convex_client = ConvexClient(settings.convex_url)
        self.embedding_service = EmbeddingService()
        self.llm_service = LLMService()

    def update_rag_status(self, source_id: str, status: str):
        # We can hit the convex site URL webhook to update ragStatus, or write a new webhook.
        # It's easier to create a small action/mutation in Convex for this, but since we didn't, 
        # let's just use the client if we have a mutation, or add one.
        try:
            self.convex_client.mutation("ingestion:updateRagStatus", {"sourceId": source_id, "ragStatus": status})
        except Exception as e:
            logger.error(f"Failed to update rag status: {e}")

    def embed_source(self, source_id: str, course_id: str):
        """Fetches chunks for a source, embeds them, and saves to Convex."""
        logger.info(f"Starting embeddings for source {source_id}")
        self.update_rag_status(source_id, "embedding")
        
        try:
            # We need to fetch all chunks for this source.
            chunks = self.convex_client.query("ingestion:getChunksForEmbedding", {"sourceId": source_id})
            
            if not chunks:
                logger.warning(f"No chunks found for source {source_id}")
                self.update_rag_status(source_id, "ready")
                return
                
            texts = [c["text"] for c in chunks]
            
            # Embed in batches of 100
            BATCH_SIZE = 100
            for i in range(0, len(texts), BATCH_SIZE):
                batch_texts = texts[i:i+BATCH_SIZE]
                batch_chunks = chunks[i:i+BATCH_SIZE]
                
                embeddings = self.embedding_service.embed_batch(batch_texts)
                
                for chunk, emb in zip(batch_chunks, embeddings):
                    self.convex_client.mutation("tutor:updateChunkEmbedding", {
                        "chunkId": chunk["_id"],
                        "embedding": emb
                    })
                    
            self.update_rag_status(source_id, "ready")
            logger.info(f"Finished embedding source {source_id}")
            
        except Exception as e:
            logger.error(f"Failed to embed source {source_id}: {e}")
            self.update_rag_status(source_id, "failed")

    def ask_tutor(self, course_id: str, session_id: str, user_id: str, question: str) -> Dict[str, Any]:
        """Handles a tutor question end-to-end."""
        logger.info(f"Asking tutor: '{question}' for course {course_id}")
        
        # 1. Get history
        # (Assuming the client doesn't need to pass a token if we use the backend API key or client secret,
        # but convex python client can't bypass auth easily if requireUser is used.
        # Wait, getMessages might require auth! Let's bypass auth for backend queries.)
        try:
            history = self.convex_client.query("tutor:getMessagesBackend", {"sessionId": session_id})
        except Exception as e:
            logger.warning(f"Could not fetch history (maybe auth protected): {e}")
            history = []
            
        formatted_history = []
        for msg in history[-5:]: # Last 5 messages
            formatted_history.append({"role": msg["role"], "content": msg["content"]})

        # 2. Embed question
        try:
            q_emb = self.embedding_service.embed_text(question)
        except Exception as e:
            return {"answer": f"Embedding error: {e}", "grounded": False, "citations": [], "retrievalStatus": "failed"}

        # 3. Retrieve chunks
        try:
            # We call the action
            retrieved = self.convex_client.action("tutor:search", {
                "courseId": course_id,
                "queryVector": q_emb,
                "limit": settings.rag_top_k
            })
        except Exception as e:
            logger.error(f"Retrieval error: {e}")
            return {"answer": "Error searching course material.", "grounded": False, "citations": [], "retrievalStatus": "failed"}

        if not retrieved:
            return {
                "answer": "I couldn't find enough information about this in the materials uploaded for this course.",
                "grounded": False,
                "citations": [],
                "retrievalStatus": "empty"
            }

        # 4. Generate Answer
        top_chunks = retrieved[:settings.rag_final_context_count]
        answer, is_grounded, citation_ids = self.llm_service.generate_grounded_answer(question, top_chunks, formatted_history)

        # 5. Format citations
        citations = []
        if is_grounded:
            for c_id in citation_ids:
                try:
                    idx = int(c_id.split("_")[1]) - 1
                    if 0 <= idx < len(top_chunks):
                        c = top_chunks[idx]
                        cit = {
                            "sourceId": c["sourceId"],
                            "sourceChunkId": c["_id"],
                            "sourceName": c.get("sourceName", "Unknown"),
                            "locationType": c.get("locationType", "page"),
                            "pageNumber": c.get("pageNumber"),
                            "slideNumber": c.get("slideNumber"),
                            "sectionTitle": c.get("sectionTitle"),
                            "excerpt": c["text"][:300] + "..." if len(c["text"]) > 300 else c["text"]
                        }
                        citations.append({k: v for k, v in cit.items() if v is not None})
                except Exception:
                    pass

        # 6. Save message to Convex
        try:
            self.convex_client.mutation("tutor:addMessageBackend", {
                "sessionId": session_id,
                "role": "user",
                "content": question
            })
            self.convex_client.mutation("tutor:addMessageBackend", {
                "sessionId": session_id,
                "role": "assistant",
                "content": answer,
                "grounded": is_grounded,
                "retrievalStatus": "success",
                "citations": citations
            })
        except Exception as e:
            logger.error(f"Failed to save messages to convex: {e}")

        return {
            "answer": answer,
            "grounded": is_grounded,
            "citations": citations,
            "retrievalStatus": "success"
        }
