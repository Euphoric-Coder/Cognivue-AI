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
                         page_count: int = None, slide_count: int = None):
    url = f"{settings.convex_url}/ingestion/status"
    headers = {"x-ingestion-secret": settings.ingestion_api_secret}
    payload = {
        "sourceId": source_id,
        "status": status,
        "processingStage": processing_stage,
        "processingProgress": processing_progress,
        "processingError": processing_error,
        "pageCount": page_count,
        "slideCount": slide_count,
    }
    # Clean up Nones
    payload = {k: v for k, v in payload.items() if v is not None}
    
    try:
        res = requests.post(url, json=payload, headers=headers)
        res.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to update convex status: {e}")

def save_chunks_to_convex(source_id: str, chunks: list):
    url = f"{settings.convex_url}/ingestion/chunks"
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

def process_source(req: IngestionRequest):
    logger.info(f"Starting processing for source {req.sourceId}")
    update_convex_status(req.sourceId, "extracting", "Downloading source", 10)
    
    tmp_path = None
    try:
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
        logger.info(f"Finished processing source {req.sourceId}")

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
