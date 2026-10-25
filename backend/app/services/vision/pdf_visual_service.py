import os
import fitz # PyMuPDF
import tempfile
import logging
from typing import List, Dict, Any
from app.config import settings
from app.services.vision.visual_classifier import VisualClassifier

logger = logging.getLogger(__name__)

class PDFVisualService:
    """Extracts educational visuals, diagrams, and figures from PDF files."""

    @staticmethod
    def extract_visuals_from_pdf(pdf_path: str, output_dir: str) -> List[Dict[str, Any]]:
        """
        Extracts visual candidates from a PDF document.

        Returns list of dicts:
            - imagePath: local path to extracted image
            - pageNumber: 1-indexed page number
            - width: int
            - height: int
            - context: nearby text from the page
            - imageHash: perceptual hash
        """
        logger.info(f"VISUAL_EXTRACTION_START: type=pdf, file={pdf_path}")
        doc = fitz.open(pdf_path)
        candidates = []
        seen_hashes = set()

        for page_index in range(len(doc)):
            if len(candidates) >= settings.visual_max_per_source:
                logger.info(f"Reached visual limit of {settings.visual_max_per_source} for PDF.")
                break

            page = doc[page_index]
            page_num = page_index + 1
            page_text = page.get_text("text").strip()

            # 1. Inspect embedded images on this page
            image_list = page.get_images(full=True)
            page_extracted_any = False

            for img_index, img_info in enumerate(image_list):
                if len(candidates) >= settings.visual_max_per_source:
                    break

                xref = img_info[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image.get("image")
                image_ext = base_image.get("ext", "png")

                temp_img_path = os.path.join(
                    output_dir, f"pdf_p{page_num}_img{img_index + 1}.{image_ext}"
                )
                with open(temp_img_path, "wb") as f:
                    f.write(image_bytes)

                is_valid, reason, dims = VisualClassifier.is_useful_visual(temp_img_path)
                if not is_valid:
                    if os.path.exists(temp_img_path):
                        os.remove(temp_img_path)
                    continue

                w, h = dims
                img_hash = VisualClassifier.compute_image_hash(temp_img_path)

                # Check for duplicate image (e.g. repeated header logo)
                is_duplicate = False
                for existing_hash in seen_hashes:
                    if VisualClassifier.hamming_distance(img_hash, existing_hash) <= 5:
                        is_duplicate = True
                        break

                if is_duplicate:
                    logger.info(f"VISUAL_SKIPPED: Duplicate visual on page {page_num}")
                    if os.path.exists(temp_img_path):
                        os.remove(temp_img_path)
                    continue

                seen_hashes.add(img_hash)
                page_extracted_any = True
                candidates.append({
                    "imagePath": temp_img_path,
                    "locationType": "page",
                    "pageNumber": page_num,
                    "width": w,
                    "height": h,
                    "context": page_text[:500] if page_text else f"Page {page_num}",
                    "imageHash": img_hash,
                })

            # 2. If no embedded raster images were found but page has drawings/tables or graphics,
            # or if the page has significant visual content (drawings), render the full page.
            drawings = page.get_drawings()
            if not page_extracted_any and drawings and len(drawings) > 5 and len(candidates) < settings.visual_max_per_source:
                try:
                    pix = page.get_pixmap(dpi=150)
                    render_path = os.path.join(output_dir, f"pdf_p{page_num}_render.png")
                    pix.save(render_path)

                    is_valid, reason, dims = VisualClassifier.is_useful_visual(render_path)
                    if is_valid:
                        w, h = dims
                        img_hash = VisualClassifier.compute_image_hash(render_path)
                        seen_hashes.add(img_hash)
                        candidates.append({
                            "imagePath": render_path,
                            "locationType": "page",
                            "pageNumber": page_num,
                            "width": w,
                            "height": h,
                            "context": page_text[:500] if page_text else f"Page {page_num}",
                            "imageHash": img_hash,
                        })
                    else:
                        if os.path.exists(render_path):
                            os.remove(render_path)
                except Exception as e:
                    logger.warning(f"Failed to render page {page_num}: {e}")

        doc.close()
        logger.info(f"PDF visual extraction finished: found {len(candidates)} candidates.")
        return candidates
