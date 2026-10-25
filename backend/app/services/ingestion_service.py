import os
import requests
import tempfile
import logging
from app.schemas.ingestion import IngestionRequest
from app.services.pdf_parser import parse_pdf
from app.services.pptx_parser import parse_pptx
from app.services.chunker import chunk_text
from app.config import settings

logger = logging.getLogger(__name__)

def update_convex_status(source_id: str, status: str, processing_stage: str = None, 
                         processing_progress: int = None, processing_error: str = None,
                         page_count: int = None, slide_count: int = None,
                         duration_seconds: float = None, transcript_segment_count: int = None):
    url = f"{settings.convex_site_url}/ingestion/status"
    headers = {"x-ingestion-secret": settings.ingestion_api_secret}
    payload = {
        "sourceId": source_id,
        "status": status,
        "processingStage": processing_stage,
        "processingProgress": processing_progress,
        "processingError": processing_error,
        "pageCount": page_count,
        "slideCount": slide_count,
        "durationSeconds": duration_seconds,
        "transcriptSegmentCount": transcript_segment_count,
    }
    # Clean up Nones
    payload = {k: v for k, v in payload.items() if v is not None}
    
    try:
        res = requests.post(url, json=payload, headers=headers)
        res.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to update convex status: {e}")

def save_chunks_to_convex(source_id: str, chunks: list):
    url = f"{settings.convex_site_url}/ingestion/chunks"
    headers = {"x-ingestion-secret": settings.ingestion_api_secret}
    payload = {
        "sourceId": source_id,
        "chunks": chunks
    }
    try:
        res = requests.post(url, json=payload, headers=headers)
        res.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to save chunks to convex: {e}")
        raise e

def save_transcript_segments_to_convex(source_id: str, segments: list) -> int:
    url = f"{settings.convex_site_url}/ingestion/segments"
    headers = {"x-ingestion-secret": settings.ingestion_api_secret}
    payload = {
        "sourceId": source_id,
        "segments": segments
    }
    try:
        res = requests.post(url, json=payload, headers=headers)
        res.raise_for_status()
        stored_count = res.json().get("insertedCount", len(segments))
        logger.info(f"TRANSCRIPT_SAVE_VALIDATION\nsegmentsExpected={len(segments)}\nsegmentsStored={stored_count}")
        if stored_count != len(segments):
            raise ValueError("TRANSCRIPT_SAVE_VALIDATION_FAILED")
        return stored_count
    except Exception as e:
        logger.error(f"Failed to save segments to convex: {e}")
        raise e

def process_source(req: IngestionRequest):
    logger.info(f"Starting processing for source {req.sourceId}")
    update_convex_status(req.sourceId, "extracting", "Downloading source", 10)
    
    tmp_path = None
    try:
        if req.mimeType.startswith("video/") or req.originalFileName.lower().endswith((".mp4", ".mov", ".webm", ".m4v")):
            from app.services.video.video_processing_service import VideoProcessingService
            update_convex_status(req.sourceId, "extracting", "Downloading video", 10)
            
            video_service = VideoProcessingService()
            result = video_service.process_video(req.fileUrl)
            
            update_convex_status(req.sourceId, "chunking", "Saving chunks and transcript", 90)
            save_transcript_segments_to_convex(req.sourceId, result["segments"])
            save_chunks_to_convex(req.sourceId, result["chunks"])
            
            update_convex_status(
                req.sourceId, 
                status="ready", 
                processing_stage="Done", 
                processing_progress=100,
                duration_seconds=result["durationSeconds"],
                transcript_segment_count=len(result["segments"])
            )

            # V5 Keyframe Visual Understanding
            keyframes = result.get("keyframes", [])
            temp_dir = result.get("tempDir")
            try:
                if keyframes:
                    from app.services.vision.visual_pipeline import VisualPipeline
                    pipeline = VisualPipeline()
                    pipeline.process_visual_candidates(
                        req.sourceId,
                        req.courseId,
                        req.originalFileName,
                        keyframes,
                    )
            except Exception as e:
                logger.error(f"Video visual processing failed for source {req.sourceId}: {e}")
            finally:
                if temp_dir and os.path.exists(temp_dir):
                    import shutil
                    shutil.rmtree(temp_dir, ignore_errors=True)
        else:
            # Download file
            res = requests.get(req.fileUrl)
            res.raise_for_status()
            
            fd, tmp_path = tempfile.mkstemp(suffix=f".{req.originalFileName.split('.')[-1]}")
            with os.fdopen(fd, 'wb') as f:
                f.write(res.content)
                
            update_convex_status(req.sourceId, "extracting", "Parsing file", 30)
            
            all_chunks = []
            page_count = 0
            slide_count = 0
            
            if req.mimeType == "application/pdf" or req.originalFileName.endswith(".pdf"):
                parser_generator = parse_pdf(tmp_path)
                for page in parser_generator:
                    page_count += 1
                    if not page["text"].strip():
                        continue
                    # Chunking
                    update_convex_status(req.sourceId, "chunking", f"Chunking page {page['pageNumber']}", 60)
                    chunks = chunk_text(page["text"], "page", page["pageNumber"])
                    all_chunks.extend(chunks)
                    
                if page_count > 0 and len(all_chunks) == 0:
                    raise ValueError("No machine-readable text found. Needs OCR.")
                    
            elif "presentation" in req.mimeType or req.originalFileName.endswith(".pptx"):
                parser_generator = parse_pptx(tmp_path)
                for slide in parser_generator:
                    slide_count += 1
                    if not slide["text"].strip() and not slide["slideTitle"].strip():
                        continue
                    update_convex_status(req.sourceId, "chunking", f"Chunking slide {slide['slideNumber']}", 60)
                    chunks = chunk_text(slide["text"], "slide", slide["slideNumber"], slide["slideTitle"])
                    all_chunks.extend(chunks)
            else:
                raise ValueError(f"Unsupported file type for processing: {req.mimeType}")

            update_convex_status(req.sourceId, "chunking", "Saving chunks", 90)
            
            save_chunks_to_convex(req.sourceId, all_chunks)
            
            update_convex_status(
                req.sourceId, 
                status="ready", 
                processing_stage="Done", 
                processing_progress=100,
                page_count=page_count,
                slide_count=slide_count
            )

            # V5 Visual Understanding for PDF and PPTX
            vis_temp_dir = tempfile.mkdtemp(prefix="cognivue_vis_")
            try:
                visual_candidates = []
                if req.mimeType == "application/pdf" or req.originalFileName.endswith(".pdf"):
                    from app.services.vision.pdf_visual_service import PDFVisualService
                    visual_candidates = PDFVisualService.extract_visuals_from_pdf(tmp_path, vis_temp_dir)
                elif "presentation" in req.mimeType or req.originalFileName.endswith(".pptx"):
                    from app.services.vision.pptx_visual_service import PPTXVisualService
                    visual_candidates = PPTXVisualService.extract_visuals_from_pptx(tmp_path, vis_temp_dir)

                if visual_candidates:
                    from app.services.vision.visual_pipeline import VisualPipeline
                    pipeline = VisualPipeline()
                    pipeline.process_visual_candidates(
                        req.sourceId,
                        req.courseId,
                        req.originalFileName,
                        visual_candidates,
                    )
            except Exception as e:
                logger.error(f"Visual processing failed for source {req.sourceId}: {e}")
            finally:
                if vis_temp_dir and os.path.exists(vis_temp_dir):
                    import shutil
                    shutil.rmtree(vis_temp_dir, ignore_errors=True)
            
        logger.info(f"Finished processing source {req.sourceId}")

        try:
            from app.services.rag.rag_service import RAGService
            rag_service = RAGService()
            rag_service.embed_source(req.sourceId, req.courseId)
        except Exception as e:
            logger.error(f"Failed to index source for AI: {e}")

    except Exception as e:
        logger.error(f"Processing failed for source {req.sourceId}: {str(e)}")
        error_msg = str(e)
        if "Needs OCR" in error_msg:
            update_convex_status(req.sourceId, "failed", processing_error="Needs OCR")
        else:
            update_convex_status(req.sourceId, "failed", processing_error=error_msg)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

def rebuild_video_index_task(source_id: str, course_id: str):
    logger.info(f"Rebuilding AI Index for video source {source_id}")
    update_convex_status(source_id, "chunking", "Rebuilding AI Index", 10)
    
    try:
        from app.services.rag.rag_service import RAGService
        rag_service = RAGService()
        
        segments = rag_service.convex_client.query("ingestion:getTranscriptSegmentsBackend", {"sourceId": source_id})
        if not segments:
            raise ValueError("No transcript segments found to rebuild index.")
            
        from app.services.video.transcript_chunker import TranscriptChunker
        chunks = TranscriptChunker.chunk_segments(segments)
        
        rag_service.convex_client.mutation("ingestion:deleteChunks", {"sourceId": source_id})
        
        save_chunks_to_convex(source_id, chunks)
        
        update_convex_status(
            source_id, 
            status="ready", 
            processing_stage="Done", 
            processing_progress=100
        )
        
        rag_service.embed_source(source_id, course_id)
        logger.info(f"Successfully rebuilt index for source {source_id}")
        
    except Exception as e:
        logger.error(f"Failed to rebuild index for source {source_id}: {e}")
        update_convex_status(source_id, "failed", processing_error=str(e))

def reprocess_visuals_task(source_id: str, course_id: str):
    """
    Reruns visual extraction & analysis for a source without modifying text RAG.
    Idempotently deletes previous visuals and visual chunks, then recreates them.
    """
    logger.info(f"Reprocessing visuals for source {source_id}")
    from app.services.vision.visual_pipeline import update_convex_visual_status, VisualPipeline
    update_convex_visual_status(source_id, "processing")

    from convex import ConvexClient
    client = ConvexClient(settings.convex_url)
    source = client.query("tutor:getSource", {"sourceId": source_id})
    if not source:
        logger.error(f"Source {source_id} not found.")
        update_convex_visual_status(source_id, "failed", error="Source not found")
        return

    # Delete previous visuals
    client.mutation("ingestion:deleteVisuals", {"sourceId": source_id})

    file_url = source.get("fileUrl")
    if not file_url:
        logger.error(f"Source {source_id} has no fileUrl.")
        update_convex_visual_status(source_id, "failed", error="Source has no fileUrl")
        return

    tmp_path = None
    vis_dir = None
    try:
        source_type = source.get("type", "unknown")
        orig_name = source.get("originalFileName", source.get("name", "source"))
        ext = orig_name.split(".")[-1] if "." in orig_name else "bin"

        res = requests.get(file_url)
        res.raise_for_status()

        fd, tmp_path = tempfile.mkstemp(suffix=f".{ext}")
        with os.fdopen(fd, "wb") as f:
            f.write(res.content)

        vis_dir = tempfile.mkdtemp(prefix="cognivue_reprocess_vis_")
        candidates = []

        if source_type == "pdf" or orig_name.endswith(".pdf"):
            from app.services.vision.pdf_visual_service import PDFVisualService
            candidates = PDFVisualService.extract_visuals_from_pdf(tmp_path, vis_dir)
        elif source_type == "pptx" or orig_name.endswith(".pptx"):
            from app.services.vision.pptx_visual_service import PPTXVisualService
            candidates = PPTXVisualService.extract_visuals_from_pptx(tmp_path, vis_dir)
        elif source_type == "video" or orig_name.lower().endswith((".mp4", ".mov", ".webm", ".m4v")):
            from app.services.video.keyframe_extractor import KeyframeExtractor
            from app.services.video.ffmpeg_service import FFmpegService
            duration = source.get("durationSeconds") or FFmpegService.get_duration(tmp_path)
            segments = client.query("ingestion:getTranscriptSegmentsBackend", {"sourceId": source_id})
            candidates = KeyframeExtractor.extract_keyframes(tmp_path, vis_dir, duration, segments)
        else:
            logger.warning(f"Unsupported source type for visuals: {source_type}")

        pipeline = VisualPipeline()
        pipeline.process_visual_candidates(source_id, course_id, source.get("name", "source"), candidates)
        logger.info(f"Visual reprocessing finished successfully for source {source_id}")

    except Exception as e:
        logger.error(f"Visual reprocessing failed for {source_id}: {e}")
        update_convex_visual_status(source_id, "failed", error=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
        if vis_dir and os.path.exists(vis_dir):
            import shutil
            shutil.rmtree(vis_dir, ignore_errors=True)

