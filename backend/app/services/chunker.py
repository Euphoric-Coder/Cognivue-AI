from typing import List, Dict, Any
from app.utils.tokens import estimate_tokens

def chunk_text(text: str, location_type: str, location_number: int, section_title: str = "") -> List[Dict[str, Any]]:
    """
    Chunks text strictly within a page or slide boundary.
    Target: 500-900 tokens. Overlap: ~100 tokens.
    """
    if not text.strip():
        return []

    # Very naive paragraph-based chunker for now.
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = []
    current_tokens = 0
    chunk_index = 0
    
    # Overlap buffer
    overlap_buffer = []
    overlap_tokens = 0
    MAX_TOKENS = 750
    OVERLAP_TARGET = 100

    def save_chunk(chunk_texts, idx):
        c_text = "\n\n".join(chunk_texts)
        chunk = {
            "text": c_text,
            "locationType": location_type,
            "sectionTitle": section_title,
            "chunkIndex": idx,
            "tokenEstimate": estimate_tokens(c_text),
            "characterCount": len(c_text)
        }
        if location_type == "page":
            chunk["pageNumber"] = location_number
        elif location_type == "slide":
            chunk["slideNumber"] = location_number
            
        chunks.append(chunk)

    for p in paragraphs:
        p_tokens = estimate_tokens(p)
        
        if current_tokens + p_tokens > MAX_TOKENS and current_chunk:
            save_chunk(current_chunk, chunk_index)
            chunk_index += 1
            
            # Start new chunk with overlap
            current_chunk = list(overlap_buffer)
            current_tokens = overlap_tokens
        
        current_chunk.append(p)
        current_tokens += p_tokens
        
        # Maintain overlap buffer (keep the last paragraph if it fits in overlap budget)
        overlap_buffer = [p]
        overlap_tokens = p_tokens

    if current_chunk:
        save_chunk(current_chunk, chunk_index)

    return chunks
