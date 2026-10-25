import logging
import json
import re
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)

class TranscriptionService:
    def __init__(self):
        if settings.gemini_api_key:
            self.client = genai.Client(api_key=settings.gemini_api_key)
        else:
            self.client = None

    def transcribe(self, audio_path: str, duration: float = 0.0, chunk_start_offset: float = 0.0, chunk_index: int = 0):
        """
        Uploads audio to Gemini and requests a timestamped transcript.
        """
        if not self.client:
            raise ValueError("Gemini API key not configured")

        uploaded_file = None
        try:
            logger.info(f"Uploading audio file to Gemini: {audio_path}")
            uploaded_file = self.client.files.upload(file=audio_path)
            
            system_instruction = (
                "You are an expert audio transcription system. "
                "Transcribe the provided audio carefully. "
                "You must return the transcription as a strict JSON array of segment objects. "
                "Each segment object must contain EXACTLY three fields: "
                "1. 'text': the spoken text. "
                "2. 'startTime': the start timestamp in seconds (float). "
                "3. 'endTime': the end timestamp in seconds (float). "
                "Do NOT include any other text, markdown blocks, or commentary."
            )
            
            prompt = "Provide the complete timestamped transcript of this audio file."
            
            logger.info("Starting Gemini transcription generation")
            response = self.client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_uri(file_uri=uploaded_file.uri, mime_type=uploaded_file.mime_type),
                            types.Part.from_text(text=prompt)
                        ]
                    )
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=0.0
                )
            )
            
            result_text = response.text
            # Clean up potential markdown formatting around json
            result_text = re.sub(r'```json\n', '', result_text)
            result_text = re.sub(r'```', '', result_text)
            result_text = result_text.strip()
            
            segments = json.loads(result_text)
            
            if segments:
                last_end = float(segments[-1].get("endTime", 0.0))
                first_start = float(segments[0].get("startTime", 0.0))
                logger.info(f"TRANSCRIPTION_CHUNK_RESULT\nchunkIndex={chunk_index}\nsourceStartTime={chunk_start_offset}\nsourceEndTime={chunk_start_offset+duration}\nproviderSegmentCount={len(segments)}\nproviderFirstTime={first_start}\nproviderLastTime={last_end}")
            
            # Normalize to ensure correct schema
            normalized_segments = []
            
            for i, seg in enumerate(segments):
                text = seg.get("text", "").strip()
                if not text:
                    continue
                    
                raw_start = float(seg.get("startTime", 0.0))
                raw_end = float(seg.get("endTime", 0.0))
                
                logger.info(f"TRANSCRIPTION_RAW_SEGMENT\naudioChunk={chunk_index}\nsegment={i}\nrawStart={raw_start}\nrawEnd={raw_end}\ntextPrefix={text[:50]}")
                
                # Basic normalization within local chunk context
                start = max(0.0, raw_start)
                end = max(start, raw_end)
                
                # Defensively clamp to local duration if provided
                if duration > 0:
                    if start >= duration:
                        logger.warning(f"Discarding segment beyond local chunk duration: start={start} >= duration={duration}")
                        continue
                    end = min(end, duration)
                
                if end - start <= 0.001:
                    continue
                    
                # Convert to global timeline exactly once!
                global_start = chunk_start_offset + start
                global_end = chunk_start_offset + end
                    
                normalized_segments.append({
                    "text": text,
                    "startTime": global_start,
                    "endTime": global_end
                })
                
            return normalized_segments
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise
        finally:
            if uploaded_file:
                try:
                    self.client.files.delete(name=uploaded_file.name)
                except Exception as e:
                    logger.warning(f"Failed to delete Gemini file: {e}")
