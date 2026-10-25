import hashlib
import logging
from typing import Tuple, Optional
from PIL import Image, ImageStat
from app.config import settings

logger = logging.getLogger(__name__)

class VisualClassifier:
    """Filters useless images, logos, icons, whitespace, and duplicates."""

    @staticmethod
    def is_useful_visual(image_path: str) -> Tuple[bool, str, Optional[Tuple[int, int]]]:
        """
        Determines whether an image is a meaningful educational visual candidate.

        Returns:
            (is_valid, reason, (width, height))
        """
        try:
            with Image.open(image_path) as img:
                width, height = img.size

                # 1. Dimension check
                if width < settings.visual_min_width or height < settings.visual_min_height:
                    reason = f"Image too small ({width}x{height} < {settings.visual_min_width}x{settings.visual_min_height})"
                    logger.info(f"VISUAL_SKIPPED: path={image_path}, reason={reason}")
                    return False, reason, (width, height)

                # 2. Total pixel check
                if width * height < 10000:
                    reason = f"Pixel count too low ({width * height} < 10000)"
                    logger.info(f"VISUAL_SKIPPED: path={image_path}, reason={reason}")
                    return False, reason, (width, height)

                # 3. Aspect ratio check (filters horizontal line separators or vertical borders)
                aspect_ratio = width / max(height, 1)
                if aspect_ratio > 10.0 or aspect_ratio < 0.1:
                    reason = f"Extreme aspect ratio ({aspect_ratio:.2f})"
                    logger.info(f"VISUAL_SKIPPED: path={image_path}, reason={reason}")
                    return False, reason, (width, height)

                # 4. Monochromatic / blank slide check using pixel variance
                gray = img.convert("L")
                stat = ImageStat.Stat(gray)
                stddev = stat.stddev[0]
                if stddev < 6.0:
                    reason = f"Image has very low variance (stddev={stddev:.2f}, likely blank/monochrome)"
                    logger.info(f"VISUAL_SKIPPED: path={image_path}, reason={reason}")
                    return False, reason, (width, height)

                logger.info(f"VISUAL_CANDIDATE_FOUND: path={image_path}, dims={width}x{height}")
                return True, "Valid educational candidate", (width, height)

        except Exception as e:
            reason = f"Failed to open image: {e}"
            logger.warning(f"VISUAL_SKIPPED: path={image_path}, reason={reason}")
            return False, reason, None

    @staticmethod
    def compute_image_hash(image_path: str) -> str:
        """
        Computes a perceptual/content hash for duplicate detection.
        Downsamples image to 16x16 grayscale and computes average hash.
        """
        try:
            with Image.open(image_path) as img:
                small = img.convert("L").resize((16, 16), Image.Resampling.BILINEAR)
                pixels = list(small.getdata())
                avg = sum(pixels) / len(pixels)
                bits = "".join("1" if p > avg else "0" for p in pixels)
                # Return hex string of the 256 bits
                return hex(int(bits, 2))[2:].zfill(64)
        except Exception:
            # Fallback to MD5
            with open(image_path, "rb") as f:
                return hashlib.md5(f.read()).hexdigest()

    @staticmethod
    def hamming_distance(hash1: str, hash2: str) -> int:
        """Calculates hamming distance between two hex hashes."""
        if not hash1 or not hash2 or len(hash1) != len(hash2):
            return 999
        try:
            val1 = int(hash1, 16)
            val2 = int(hash2, 16)
            xor = val1 ^ val2
            return bin(xor).count("1")
        except Exception:
            return 999
