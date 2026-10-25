import logging

logger = logging.getLogger(__name__)

VIDEO_TARGET_CHUNK_SECONDS = 30
VIDEO_MAX_CHUNK_SECONDS = 45
VIDEO_MIN_CHUNK_SECONDS = 12

class TranscriptChunker:
    @staticmethod
    def chunk_segments(segments: list):
        chunks = []
        current_chunk_text = []
        current_chunk_start = None
        current_chunk_end = None
        chunk_index = 0
        
        for seg in segments:
            text = seg.get("text", "").strip()
            if not text:
                continue
                
            if current_chunk_start is None:
                current_chunk_start = seg["startTime"]
                
            current_chunk_text.append(text)
            current_chunk_end = seg["endTime"]
            
            duration = current_chunk_end - current_chunk_start
            
            # Check boundaries
            is_sentence_end = text.endswith(('.', '?', '!', '."', '?"', '!"'))
            
            if duration >= VIDEO_TARGET_CHUNK_SECONDS and is_sentence_end:
                # Target reached at natural boundary
                chunks.append(TranscriptChunker._create_chunk(current_chunk_text, current_chunk_start, current_chunk_end, chunk_index))
                chunk_index += 1
                current_chunk_text = []
                current_chunk_start = None
            elif duration >= VIDEO_MAX_CHUNK_SECONDS:
                # Hard max reached, flush
                chunks.append(TranscriptChunker._create_chunk(current_chunk_text, current_chunk_start, current_chunk_end, chunk_index))
                chunk_index += 1
                current_chunk_text = []
                current_chunk_start = None
                
        # Flush remaining
        if current_chunk_text:
            chunks.append(TranscriptChunker._create_chunk(current_chunk_text, current_chunk_start, current_chunk_end, chunk_index))
            
        return chunks
        
    @staticmethod
    def _create_chunk(texts: list, start: float, end: float, index: int) -> dict:
        chunk_str = " ".join(texts).strip()
        return {
            "text": chunk_str,
            "startTime": start,
            "endTime": end,
            "chunkIndex": index,
            "characterCount": len(chunk_str),
            "locationType": "video"
        }
