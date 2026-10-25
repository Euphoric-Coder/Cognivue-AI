import subprocess
import logging

logger = logging.getLogger(__name__)

class FFmpegService:
    @staticmethod
    def extract_audio(video_path: str, output_path: str) -> bool:
        """
        Extracts 16kHz mono audio from a video file.
        Returns True on success, False otherwise.
        """
        try:
            command = [
                'ffmpeg',
                '-i', video_path,
                '-vn', # no video
                '-acodec', 'pcm_s16le', # 16-bit PCM
                '-ar', '16000', # 16kHz
                '-ac', '1', # Mono
                '-y', # Overwrite output
                output_path
            ]
            logger.info(f"Extracting audio: {' '.join(command)}")
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if result.returncode != 0:
                logger.error(f"FFmpeg error: {result.stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"FFmpeg extraction failed: {e}")
            return False

    @staticmethod
    def extract_audio_chunk(video_path: str, output_path: str, start_time: float, duration: float) -> bool:
        """
        Extracts a chunk of 16kHz mono audio from a video file.
        """
        try:
            command = [
                'ffmpeg',
                '-ss', str(start_time),
                '-i', video_path,
                '-t', str(duration),
                '-vn',
                '-acodec', 'pcm_s16le',
                '-ar', '16000',
                '-ac', '1',
                '-y',
                output_path
            ]
            logger.info(f"Extracting audio chunk: start={start_time} duration={duration}")
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if result.returncode != 0:
                logger.error(f"FFmpeg chunk error: {result.stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"FFmpeg chunk extraction failed: {e}")
            return False

    @staticmethod
    def get_duration(file_path: str) -> float:
        """
        Gets duration of media file using ffprobe.
        """
        try:
            command = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                file_path
            ]
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if result.returncode == 0 and result.stdout.strip():
                return float(result.stdout.strip())
            return 0.0
        except Exception as e:
            logger.error(f"ffprobe failed: {e}")
            return 0.0
