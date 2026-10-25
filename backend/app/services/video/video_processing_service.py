import os
import shutil
import tempfile
import logging
import requests
from app.services.video.ffmpeg_service import FFmpegService
from app.services.video.transcription_service import TranscriptionService
from app.services.video.transcript_chunker import TranscriptChunker

logger = logging.getLogger(__name__)

class VideoProcessingService:
    def __init__(self):
        self.transcriber = TranscriptionService()

    def download_file(self, url: str, dest_path: str):
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

    def process_video(self, file_url: str) -> dict:
        """
        Downloads the video, extracts audio, transcribes it, and chunks it.
        Returns:
        {
            "durationSeconds": float,
            "segments": [...],
            "chunks": [...]
        }
        """
        temp_dir = tempfile.mkdtemp(prefix="cognivue_video_")
        try:
            logger.info(f"VIDEO_PROCESS_START: {file_url}")
            
            video_path = os.path.join(temp_dir, "video.mp4")
            audio_path = os.path.join(temp_dir, "audio.wav")
            
            # Download video
            self.download_file(file_url, video_path)
            
            duration = FFmpegService.get_duration(video_path)
            
            # Extract audio
            success = FFmpegService.extract_audio(video_path, audio_path)
            if not success:
                raise Exception("VIDEO_AUDIO_EXTRACT_FAILED")
                
            audio_duration = FFmpegService.get_duration(audio_path)
            logger.info(f"VIDEO_DURATION_DETECTED\nsourceId=...\ndurationSeconds={duration}")
            logger.info(f"AUDIO_DURATION_DETECTED\nvideoDuration={duration}\naudioDuration={audio_duration}")
            
            logger.info("VIDEO_AUDIO_EXTRACT_COMPLETE")
            
            logger.info("VIDEO_TRANSCRIPTION_START")
            chunk_duration = 60.0
            overlap = 5.0
            
            all_segments = []
            start_time = 0.0
            chunk_index = 0
            
            while start_time < duration:
                end_time = min(start_time + chunk_duration, duration)
                actual_duration = end_time - start_time
                chunk_audio_path = os.path.join(temp_dir, f"audio_chunk_{chunk_index}.wav")
                
                success = FFmpegService.extract_audio_chunk(audio_path, chunk_audio_path, start_time, actual_duration)
                if success:
                    raw_segments = self.transcriber.transcribe(
                        chunk_audio_path, 
                        duration=actual_duration, 
                        chunk_start_offset=start_time,
                        chunk_index=chunk_index
                    )
                    all_segments.extend(raw_segments)
                
                if end_time >= duration:
                    break
                
                start_time = end_time - overlap
                chunk_index += 1
            
            # Sort segments chronologically
            all_segments.sort(key=lambda s: (s['startTime'], s['endTime']))
            
            # Deduplicate by text similarity AND timestamp overlap
            merged_segments = []
            for seg in all_segments:
                if not merged_segments:
                    merged_segments.append(seg)
                    continue
                
                prev = merged_segments[-1]
                
                # Check for temporal overlap and text similarity
                is_overlap = (seg['startTime'] < prev['endTime'])
                text_similarity = (seg['text'][:20] == prev['text'][:20] or prev['text'].endswith(seg['text'][:20]))
                
                if is_overlap and text_similarity:
                    # Merge segment
                    prev['endTime'] = max(prev['endTime'], seg['endTime'])
                    # If it's essentially the same text, we keep the previous, otherwise we might append the distinct part
                    if seg['text'] not in prev['text']:
                        # Avoid duplicates
                        overlap_idx = prev['text'].find(seg['text'][:15])
                        if overlap_idx != -1:
                            prev['text'] = prev['text'][:overlap_idx] + seg['text']
                        else:
                            prev['text'] = prev['text'] + " " + seg['text']
                else:
                    merged_segments.append(seg)
            
            # Gap detection
            for i in range(1, len(merged_segments)):
                prev = merged_segments[i-1]
                curr = merged_segments[i]
                gap = curr['startTime'] - prev['endTime']
                if gap > 8.0:
                    logger.warning(f"TRANSCRIPT_COVERAGE_GAP_DETECTED\npreviousEnd={prev['endTime']}\ncurrentStart={curr['startTime']}\ngapSeconds={gap}")
            
            # Re-index uniquely
            for i, seg in enumerate(merged_segments):
                seg['segmentIndex'] = i
            
            segments = merged_segments
            logger.info("VIDEO_TRANSCRIPTION_COMPLETE")
            
            # Chunking
            chunks = TranscriptChunker.chunk_segments(segments)
            logger.info("VIDEO_TRANSCRIPT_CHUNK_COMPLETE")

            # V5 Keyframe Visual Extraction
            from app.services.video.keyframe_extractor import KeyframeExtractor
            keyframes_dir = os.path.join(temp_dir, "keyframes")
            os.makedirs(keyframes_dir, exist_ok=True)
            keyframes = KeyframeExtractor.extract_keyframes(video_path, keyframes_dir, duration, segments)
            
            logger.info("VIDEO_PROCESS_COMPLETE")
            return {
                "durationSeconds": duration,
                "segments": segments,
                "chunks": chunks,
                "keyframes": keyframes,
                "tempDir": temp_dir # Keep tempDir for caller to process keyframe images before cleanup
            }
            
        except Exception as e:
            logger.error(f"VIDEO_PROCESS_FAILED: {e}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise
