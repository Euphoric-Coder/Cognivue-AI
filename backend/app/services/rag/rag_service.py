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
                    
            # Verification Step
            updated_chunks = self.convex_client.query("ingestion:getChunksForEmbedding", {"sourceId": source_id})
            embedded_count = sum(1 for c in updated_chunks if c.get("embedding") is not None)
            
            if embedded_count == len(chunks):
                self.update_rag_status(source_id, "ready")
                logger.info(f"Finished embedding source {source_id}")
            else:
                logger.error(f"Embedding validation failed for {source_id}: {embedded_count}/{len(chunks)} embedded.")
                self.update_rag_status(source_id, "failed")
            
        except Exception as e:
            logger.error(f"Failed to embed source {source_id}: {e}")
            self.update_rag_status(source_id, "failed")

    def ask_tutor(self, course_id: str, session_id: str, user_id: str, question: str) -> Dict[str, Any]:
        """Handles a tutor question end-to-end."""
        logger.info(f"Asking tutor: '{question}' for course {course_id}")
        
        logger.info(f"RAG_QUERY_START\nquery=\"{question}\"")
        
        # 1. Get history
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

        log_candidates = "RAG_VECTOR_CANDIDATES\n\n"
        visual_candidates_count = 0
        for i, c in enumerate(retrieved):
            ev_type = c.get("evidenceType", "text")
            if ev_type == "visual":
                visual_candidates_count += 1
            log_candidates += f"{i+1}.\n"
            log_candidates += f"chunkId={c.get('_id')}\n"
            log_candidates += f"sourceId={c.get('sourceId')}\n"
            log_candidates += f"evidenceType={ev_type}\n"
            if c.get("visualType"):
                log_candidates += f"visualType={c.get('visualType')}\n"
            if c.get("locationType") == "video":
                log_candidates += "locationType=video\n"
                log_candidates += f"startTime={c.get('startTime')}\n"
                log_candidates += f"endTime={c.get('endTime')}\n"
            log_candidates += f"score={c.get('_score')}\n\n"
        logger.info(log_candidates.strip())
        logger.info(f"RAG_VISUAL_CANDIDATES\nvisualCandidatesCount={visual_candidates_count}\ntotalCandidates={len(retrieved)}")
        
        logger.info("RAG_POST_FILTER_RESULTS\n(No post-filtering applied)")

        if not retrieved:
            return {
                "answer": "I couldn't find enough information about this in the materials uploaded for this course.",
                "grounded": False,
                "citations": [],
                "retrievalStatus": "empty"
            }

        # 4. Generate Answer
        top_chunks = retrieved[:settings.rag_final_context_count]
        logger.info(f"RAG_MULTIMODAL_FINAL_CONTEXTS\ncontexts={len(top_chunks)}")

        # 4B. Optional Graph-Aware Retrieval Context (1-Hop concept expansion)
        try:
            graph_data = self.convex_client.query("knowledgeGraph:getCourseKnowledgeGraph", {"courseId": course_id})
            if graph_data and graph_data.get("concepts"):
                q_lower = question.lower()
                matched_concepts = [c for c in graph_data["concepts"] if c["name"].lower() in q_lower]
                if matched_concepts:
                    matched_ids = {c["_id"] for c in matched_concepts}
                    connected_rel_names = []
                    for r in graph_data.get("relationships", []):
                        if r["fromConceptId"] in matched_ids or r["toConceptId"] in matched_ids:
                            connected_rel_names.append(r.get("relationType", "RELATED_TO"))
                    logger.info(f"RAG_GRAPH_AWARE_CONTEXT_ENRICHED: matchedConcepts={len(matched_concepts)}, relations={len(connected_rel_names)}")
        except Exception as e:
            logger.debug(f"Graph-aware retrieval check skipped: {e}")
        
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
                            "startTime": c.get("startTime"),
                            "endTime": c.get("endTime"),
                            "evidenceType": c.get("evidenceType", "text"),
                            "visualType": c.get("visualType"),
                            "sourceVisualId": str(c["sourceVisualId"]) if c.get("sourceVisualId") else None,
                            "imageUrl": c.get("imageUrl"),
                            "confidenceNotes": c.get("confidenceNotes"),
                            "sectionTitle": c.get("sectionTitle") or c.get("visualTitle"),
                            "excerpt": c["text"][:300] + "..." if len(c["text"]) > 300 else c["text"]
                        }
                        
                        if cit.get("locationType") == "video":
                            start = cit.get("startTime")
                            end = cit.get("endTime")
                            video_duration = c.get("videoDuration")
                            if start is None or end is None or video_duration is None or not (0 <= start < video_duration and 0 < end <= video_duration and start < end):
                                logger.error(f"INVALID_VIDEO_CITATION_TIMESTAMP: start={start}, end={end}, duration={video_duration}")
                                continue
                                
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
