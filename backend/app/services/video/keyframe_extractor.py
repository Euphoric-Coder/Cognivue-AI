import os
import subprocess
import logging
from typing import List, Dict, Any, Optional
from app.config import settings
from app.services.vision.visual_classifier import VisualClassifier
from app.services.video.ffmpeg_service import FFmpegService

logger = logging.getLogger(__name__)

class KeyframeExtractor:
    """Extracts conservative, deduplicated keyframes from educational videos."""

    @staticmethod
    def extract_keyframes(
        video_path: str,
        output_dir: str,
        duration: float,
        segments: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Extracts representative keyframes from video and fuses them with surrounding transcript.

        Returns list of dicts:
            - imagePath: path to extracted jpg/png
            - timestamp: float in seconds
            - startTime: float in seconds
            - endTime: float in seconds
            - width: int
            - height: int
            - context: fused surrounding transcript narration
            - imageHash: perceptual hash
        """
        logger.info(f"KEYFRAME_EXTRACTION_START: file={video_path}, duration={duration:.2f}s")
        if duration <= 0:
            duration = FFmpegService.get_duration(video_path)
            if duration <= 0:
                logger.warning("Could not determine video duration; skipping keyframe extraction.")
                return []

        # 1. Determine candidate timestamps
        # Use transcript segment timestamps and scene boundaries
        candidate_times = []

        if segments and len(segments) > 0:
            # Sample at segment boundaries with a step to avoid sampling too frequently
            # E.g. pick segments spaced at least 8-15 seconds apart
            last_t = -999.0
            for seg in segments:
                t = float(seg.get("startTime", 0.0))
                # Sample 1-2 seconds into the segment to avoid transition wipes
                sample_t = min(t + 1.5, duration - 0.5)
                if sample_t - last_t >= 10.0 and sample_t < duration:
                    candidate_times.append(sample_t)
                    last_t = sample_t
        else:
            # Fallback to evenly spaced candidate sampling
            interval = max(15.0, duration / float(settings.video_max_keyframes * 2))
            t = 2.0
            while t < duration - 1.0:
                candidate_times.append(t)
                t += interval

        logger.info(f"Evaluating {len(candidate_times)} candidate timestamps for keyframes.")

        keyframes = []
        seen_hashes = set()
        max_frames = settings.video_max_keyframes

        for idx, ts in enumerate(candidate_times):
            if len(keyframes) >= max_frames:
                break

            frame_path = os.path.join(output_dir, f"keyframe_{int(ts)}s_{idx}.jpg")
            success = KeyframeExtractor._extract_single_frame(video_path, ts, frame_path)
            if not success or not os.path.exists(frame_path):
                continue

            # Check candidate validity
            is_valid, reason, dims = VisualClassifier.is_useful_visual(frame_path)
            if not is_valid:
                if os.path.exists(frame_path):
                    os.remove(frame_path)
                continue

            w, h = dims
            img_hash = VisualClassifier.compute_image_hash(frame_path)

            # Deduplicate (e.g. speaker talking over the same static presentation slide)
            is_duplicate = False
            for prev_hash in seen_hashes:
                dist = VisualClassifier.hamming_distance(img_hash, prev_hash)
                if dist <= 12: # Visually similar slide/frame
                    is_duplicate = True
                    break

            if is_duplicate:
                logger.info(f"KEYFRAME_SKIPPED_DUPLICATE: timestamp={ts:.2f}s (matches previous slide)")
                if os.path.exists(frame_path):
                    os.remove(frame_path)
                continue

            seen_hashes.add(img_hash)

            # Fuse with surrounding transcript text (+/- 15s)
            fused_transcript = KeyframeExtractor._get_surrounding_transcript(ts, segments)
            context = f"Video Frame at {int(ts // 60):02d}:{int(ts % 60):02d}.\nSurrounding Narration:\n{fused_transcript}"

            end_time = min(ts + 10.0, duration)
            keyframes.append({
                "imagePath": frame_path,
                "locationType": "video",
                "timestamp": round(ts, 2),
                "startTime": round(ts, 2),
                "endTime": round(end_time, 2),
                "width": w,
                "height": h,
                "context": context,
                "imageHash": img_hash,
            })
            logger.info(f"KEYFRAME_ACCEPTED: timestamp={ts:.2f}s, frameCount={len(keyframes)}")

        logger.info(f"KEYFRAME_EXTRACTION_COMPLETE: extracted={len(keyframes)} frames")
        return keyframes

    @staticmethod
    def _extract_single_frame(video_path: str, timestamp: float, output_path: str) -> bool:
        """Invokes FFmpeg to extract a single frame at exact timestamp."""
        try:
            cmd = [
                "ffmpeg",
                "-ss", str(timestamp),
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "2",
                "-y",
                output_path,
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            return res.returncode == 0
        except Exception as e:
            logger.error(f"FFmpeg frame extraction failed at {timestamp}s: {e}")
            return False

    @staticmethod
    def _get_surrounding_transcript(ts: float, segments: Optional[List[Dict[str, Any]]]) -> str:
        """Finds transcript spoken within +/- 15 seconds of the timestamp."""
        if not segments:
            return ""
        surrounding = []
        window_start = max(0.0, ts - 15.0)
        window_end = ts + 15.0
        for seg in segments:
            s_start = float(seg.get("startTime", 0.0))
            s_end = float(seg.get("endTime", 0.0))
            if s_end >= window_start and s_start <= window_end:
                surrounding.append(seg.get("text", "").strip())
        return " ".join(surrounding)
