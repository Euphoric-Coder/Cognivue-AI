import os
import requests
import logging
from typing import List, Dict, Any, Optional
from convex import ConvexClient
from app.config import settings
from app.services.vision.gemini_vision_provider import GeminiVisionProvider
from app.services.rag.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)

def update_convex_visual_status(source_id: str, status: str, error: Optional[str] = None):
    url = f"{settings.convex_site_url}/ingestion/visual-status"
    headers = {"x-ingestion-secret": settings.ingestion_api_secret}
    payload = {
        "sourceId": source_id,
        "visualStatus": status,
        "visualError": error,
    }
    try:
        res = requests.post(url, json=payload, headers=headers)
        res.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to update convex visual status: {e}")

def upload_visual_image_to_convex(image_path: str) -> Dict[str, str]:
    """Uploads an image file to Convex storage and returns storageId and imageUrl."""
    url = f"{settings.convex_site_url}/ingestion/upload-visual"
    headers = {"x-ingestion-secret": settings.ingestion_api_secret}
    with open(image_path, "rb") as f:
        file_bytes = f.read()

    res = requests.post(url, data=file_bytes, headers=headers)
    res.raise_for_status()
    return res.json()

def save_visuals_to_convex(source_id: str, visuals: list) -> Dict[str, Any]:
    url = f"{settings.convex_site_url}/ingestion/visuals"
    headers = {"x-ingestion-secret": settings.ingestion_api_secret}
    payload = {
        "sourceId": source_id,
        "visuals": visuals
    }
    res = requests.post(url, json=payload, headers=headers)
    res.raise_for_status()
    return res.json()

def save_visual_chunks_to_convex(source_id: str, chunks: list):
    url = f"{settings.convex_site_url}/ingestion/visual-chunks"
    headers = {"x-ingestion-secret": settings.ingestion_api_secret}
    payload = {
        "sourceId": source_id,
        "chunks": chunks
    }
    res = requests.post(url, json=payload, headers=headers)
    res.raise_for_status()

class VisualPipeline:
    def __init__(self):
        self.vision_provider = GeminiVisionProvider()
        self.embedding_service = EmbeddingService()
        self.convex_client = ConvexClient(settings.convex_url)

    def process_visual_candidates(
        self,
        source_id: str,
        course_id: str,
        source_name: str,
        candidates: List[Dict[str, Any]],
    ):
        """
        Processes visual candidates end-to-end:
        analysis -> upload -> Convex metadata -> multimodal chunks -> embeddings.
        """
        if not candidates:
            logger.info(f"No visual candidates found for source {source_id}.")
            update_convex_visual_status(source_id, "ready")
            return

        logger.info(f"VISUAL_PROCESSING_START: sourceId={source_id}, candidates={len(candidates)}")
        update_convex_visual_status(source_id, "processing")

        try:
            visual_records = []
            analyzed_candidates = []

            for idx, cand in enumerate(candidates):
                img_path = cand["imagePath"]
                loc_type = cand.get("locationType", "page")
                page_num = cand.get("pageNumber")
                slide_num = cand.get("slideNumber")
                start_t = cand.get("startTime")
                end_t = cand.get("endTime")

                # 1. Vision analysis
                logger.info(f"VISUAL_ANALYSIS_START: item {idx+1}/{len(candidates)} at {loc_type}")
                analysis = self.vision_provider.analyze_image(
                    img_path, context=cand.get("context")
                )

                # 2. Upload image to Convex storage
                try:
                    upload_res = upload_visual_image_to_convex(img_path)
                    storage_id = upload_res.get("storageId")
                    image_url = upload_res.get("imageUrl")
                except Exception as e:
                    logger.error(f"Failed to upload visual image to Convex storage: {e}")
                    storage_id = None
                    image_url = None

                vis_id = f"{source_id}_vis_{idx+1}"
                extracted_text = ", ".join(analysis.get("visibleText", []))

                record = {
                    "visualId": vis_id,
                    "locationType": loc_type,
                    "pageNumber": page_num,
                    "slideNumber": slide_num,
                    "startTime": start_t,
                    "endTime": end_t,
                    "visualType": analysis.get("visualType", "unknown"),
                    "storageId": storage_id,
                    "imageUrl": image_url,
                    "width": cand.get("width"),
                    "height": cand.get("height"),
                    "extractedText": extracted_text if extracted_text else None,
                    "title": analysis.get("title", "Course Visual"),
                    "description": analysis.get("educationalExplanation", "Visual from course material."),
                    "structuredData": analysis.get("structuredData"),
                    "confidenceNotes": analysis.get("confidenceNotes") or [],
                    "confidence": 1.0,
                    "processingStatus": "ready",
                }
                # Filter None values for optional schema fields
                clean_record = {k: v for k, v in record.items() if v is not None}
                visual_records.append(clean_record)
                analyzed_candidates.append({
                    "record": clean_record,
                    "analysis": analysis,
                    "cand": cand,
                })

            # 3. Save sourceVisuals to Convex
            save_res = save_visuals_to_convex(source_id, visual_records)
            visual_id_map = save_res.get("visualIdMap", {})
            logger.info(f"VISUAL_METADATA_SAVED: count={len(visual_records)}")

            # 4. Generate multimodal searchable representations for RAG
            visual_chunks = []
            for idx, item in enumerate(analyzed_candidates):
                rec = item["record"]
                ana = item["analysis"]
                cand = item["cand"]
                vis_doc_id = visual_id_map.get(rec["visualId"])

                loc_str = ""
                if rec["locationType"] == "page":
                    loc_str = f"Page {rec.get('pageNumber', '?')}"
                elif rec["locationType"] == "slide":
                    loc_str = f"Slide {rec.get('slideNumber', '?')}"
                elif rec["locationType"] == "video":
                    s = rec.get("startTime", 0)
                    e = rec.get("endTime", 0)
                    loc_str = f"Video Segment {int(s // 60):02d}:{int(s % 60):02d} - {int(e // 60):02d}:{int(e % 60):02d}"

                # Searchable text block
                searchable_parts = [
                    f"[Visual Evidence: {rec['visualType'].upper()}]",
                    f"Title: {rec.get('title', 'Visual')}",
                    f"Source: {source_name}",
                    f"Location: {loc_str}",
                    f"Description: {rec.get('description', '')}",
                ]
                if ana.get("visibleText"):
                    searchable_parts.append(f"Visible Text/Labels: {', '.join(ana['visibleText'])}")
                if ana.get("keyEntities"):
                    searchable_parts.append(f"Key Entities: {', '.join(ana['keyEntities'])}")
                if ana.get("relationships"):
                    searchable_parts.append(f"Visible Relationships: {'; '.join(ana['relationships'])}")
                if ana.get("importantValues"):
                    searchable_parts.append(f"Values & Comparisons: {'; '.join(ana['importantValues'])}")
                if cand.get("context"):
                    searchable_parts.append(f"Surrounding Context: {cand['context']}")

                chunk_text = "\n".join(searchable_parts)

                chunk = {
                    "text": chunk_text,
                    "locationType": rec["locationType"],
                    "pageNumber": rec.get("pageNumber"),
                    "slideNumber": rec.get("slideNumber"),
                    "startTime": rec.get("startTime"),
                    "endTime": rec.get("endTime"),
                    "sectionTitle": rec.get("title"),
                    "chunkIndex": 1000 + idx, # Offset to distinguish from initial text chunks
                    "tokenEstimate": int(len(chunk_text) / 4),
                    "characterCount": len(chunk_text),
                    "sourceVisualId": vis_doc_id,
                    "evidenceType": "visual",
                    "visualType": rec["visualType"],
                }
                clean_chunk = {k: v for k, v in chunk.items() if v is not None}
                visual_chunks.append(clean_chunk)

            # 5. Save visual chunks to Convex
            save_visual_chunks_to_convex(source_id, visual_chunks)
            logger.info(f"VISUAL_CHUNKS_SAVED: count={len(visual_chunks)}")

            # 6. Embed visual chunks
            texts_to_embed = [c["text"] for c in visual_chunks]
            embeddings = self.embedding_service.embed_batch(texts_to_embed)

            # Fetch existing chunk documents in Convex to get their _ids for updating embedding
            all_chunks = self.convex_client.query("ingestion:getChunksForEmbedding", {"sourceId": source_id})
            vis_chunks_in_convex = [c for c in all_chunks if c.get("evidenceType") == "visual"]

            # Match and update embeddings
            for c_doc, emb in zip(vis_chunks_in_convex, embeddings):
                self.convex_client.mutation("tutor:updateChunkEmbedding", {
                    "chunkId": c_doc["_id"],
                    "embedding": emb,
                })

            logger.info(f"VISUAL_EMBED_COMPLETE: embedded={len(embeddings)} visual chunks")
            update_convex_visual_status(source_id, "ready")
            logger.info(f"VISUAL_PROCESSING_COMPLETE: sourceId={source_id}")

        except Exception as e:
            logger.error(f"VISUAL_PROCESSING_FAILED for source {source_id}: {e}")
            update_convex_visual_status(source_id, "failed", error=str(e))
