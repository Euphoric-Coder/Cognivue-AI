import os
import logging
from typing import List, Dict, Any
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from PIL import Image, ImageDraw, ImageFont
from app.config import settings
from app.services.vision.visual_classifier import VisualClassifier

logger = logging.getLogger(__name__)

class PPTXVisualService:
    """Extracts visuals, pictures, diagrams, and tables from PPTX presentations."""

    @staticmethod
    def extract_visuals_from_pptx(pptx_path: str, output_dir: str) -> List[Dict[str, Any]]:
        """
        Extracts visual candidates from a PPTX file.
        """
        logger.info(f"VISUAL_EXTRACTION_START: type=pptx, file={pptx_path}")
        prs = Presentation(pptx_path)
        candidates = []
        seen_hashes = set()

        for slide_index, slide in enumerate(prs.slides):
            if len(candidates) >= settings.visual_max_per_source:
                logger.info(f"Reached visual limit of {settings.visual_max_per_source} for PPTX.")
                break

            slide_num = slide_index + 1
            slide_title = ""
            slide_texts = []
            extracted_pictures_on_slide = 0

            # Collect slide text
            for shape in slide.shapes:
                if shape.has_text_frame:
                    text = shape.text.strip()
                    if text:
                        if not slide_title and shape == slide.shapes[0]:
                            slide_title = text.split("\n")[0]
                        slide_texts.append(text)

            slide_context = f"Slide {slide_num}: {slide_title}\n" + "\n".join(slide_texts)

            # 1. Extract embedded pictures & shapes
            for shape_idx, shape in enumerate(slide.shapes):
                if len(candidates) >= settings.visual_max_per_source:
                    break

                # A. Pictures
                if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                    try:
                        image = shape.image
                        image_bytes = image.blob
                        ext = image.ext or "png"
                        img_path = os.path.join(
                            output_dir, f"pptx_s{slide_num}_img{shape_idx + 1}.{ext}"
                        )
                        with open(img_path, "wb") as f:
                            f.write(image_bytes)

                        is_valid, reason, dims = VisualClassifier.is_useful_visual(img_path)
                        if not is_valid:
                            if os.path.exists(img_path):
                                os.remove(img_path)
                            continue

                        w, h = dims
                        img_hash = VisualClassifier.compute_image_hash(img_path)

                        # Deduplicate (e.g. university logo in footer of every slide)
                        is_dup = any(
                            VisualClassifier.hamming_distance(img_hash, h_val) <= 5
                            for h_val in seen_hashes
                        )
                        if is_dup:
                            logger.info(f"VISUAL_SKIPPED: Duplicate visual on slide {slide_num}")
                            if os.path.exists(img_path):
                                os.remove(img_path)
                            continue

                        seen_hashes.add(img_hash)
                        extracted_pictures_on_slide += 1
                        candidates.append({
                            "imagePath": img_path,
                            "locationType": "slide",
                            "slideNumber": slide_num,
                            "width": w,
                            "height": h,
                            "context": slide_context[:600],
                            "imageHash": img_hash,
                        })
                    except Exception as e:
                        logger.warning(f"Failed to extract picture shape on slide {slide_num}: {e}")

                # B. Tables
                elif shape.has_table:
                    try:
                        table = shape.table
                        headers = [cell.text.strip() for cell in table.rows[0].cells]
                        rows = []
                        for row in table.rows[1:]:
                            rows.append([cell.text.strip() for cell in row.cells])

                        # Render table to an image representation for visual pipeline
                        tbl_img_path = os.path.join(
                            output_dir, f"pptx_s{slide_num}_table{shape_idx + 1}.png"
                        )
                        PPTXVisualService._render_table_image(headers, rows, tbl_img_path)

                        if os.path.exists(tbl_img_path):
                            is_valid, reason, dims = VisualClassifier.is_useful_visual(tbl_img_path)
                            if is_valid:
                                w, h = dims
                                img_hash = VisualClassifier.compute_image_hash(tbl_img_path)
                                seen_hashes.add(img_hash)
                                candidates.append({
                                    "imagePath": tbl_img_path,
                                    "locationType": "slide",
                                    "slideNumber": slide_num,
                                    "width": w,
                                    "height": h,
                                    "context": f"Table on slide {slide_num}.\n{slide_context[:400]}",
                                    "imageHash": img_hash,
                                    "structuredData": {"headers": headers, "rows": rows},
                                })
                    except Exception as e:
                        logger.warning(f"Failed to extract table on slide {slide_num}: {e}")

            # 2. Section 10: Slide-level rendering for diagrams made of shapes/connectors
            # If a slide has multiple non-picture shapes (e.g. diagrams, flowcharts, rectangles, arrows)
            # and no picture was extracted, render a synthetic slide image so layout is preserved!
            non_text_shapes = [
                s for s in slide.shapes
                if s.shape_type in {
                    MSO_SHAPE_TYPE.AUTO_SHAPE,
                    MSO_SHAPE_TYPE.FREEFORM,
                    MSO_SHAPE_TYPE.GROUP,
                    MSO_SHAPE_TYPE.LINE,
                }
            ]
            if extracted_pictures_on_slide == 0 and len(non_text_shapes) >= 2 and len(candidates) < settings.visual_max_per_source:
                try:
                    render_path = os.path.join(output_dir, f"pptx_s{slide_num}_rendered_slide.png")
                    PPTXVisualService._render_slide_diagram(slide, slide_title, non_text_shapes, render_path)
                    if os.path.exists(render_path):
                        is_valid, _, dims = VisualClassifier.is_useful_visual(render_path)
                        if is_valid:
                            w, h = dims
                            img_hash = VisualClassifier.compute_image_hash(render_path)
                            seen_hashes.add(img_hash)
                            candidates.append({
                                "imagePath": render_path,
                                "locationType": "slide",
                                "slideNumber": slide_num,
                                "width": w,
                                "height": h,
                                "context": slide_context[:600],
                                "imageHash": img_hash,
                            })
                except Exception as e:
                    logger.warning(f"Failed to render slide diagram for slide {slide_num}: {e}")

        logger.info(f"PPTX visual extraction complete: found {len(candidates)} candidates.")
        return candidates

    @staticmethod
    def _render_table_image(headers: List[str], rows: List[List[str]], out_path: str):
        """Renders an HTML-style table card image using Pillow."""
        width = 800
        row_height = 40
        height = max(200, (len(rows) + 2) * row_height + 40)
        img = Image.new("RGB", (width, height), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)

        # Draw header background
        draw.rectangle([20, 20, width - 20, 20 + row_height], fill=(235, 240, 248), outline=(180, 200, 220))
        col_width = (width - 40) // max(len(headers), 1)

        for col_idx, h in enumerate(headers):
            x = 30 + col_idx * col_width
            draw.text((x, 30), str(h)[:30], fill=(20, 40, 80))

        y = 20 + row_height
        for r_idx, row in enumerate(rows):
            fill = (255, 255, 255) if r_idx % 2 == 0 else (248, 250, 252)
            draw.rectangle([20, y, width - 20, y + row_height], fill=fill, outline=(220, 225, 230))
            for c_idx, cell_text in enumerate(row):
                x = 30 + c_idx * col_width
                draw.text((x, y + 10), str(cell_text)[:30], fill=(40, 40, 40))
            y += row_height

        img.save(out_path)

    @staticmethod
    def _render_slide_diagram(slide, title: str, shapes: list, out_path: str):
        """Renders shapes from a slide into an image card showing the diagram layout."""
        width = 960
        height = 540
        img = Image.new("RGB", (width, height), color=(250, 252, 255))
        draw = ImageDraw.Draw(img)

        # Header bar
        draw.rectangle([0, 0, width, 50], fill=(40, 60, 90))
        draw.text((25, 16), title or "Slide Diagram", fill=(255, 255, 255))

        # Scale slide coordinate system (emu) to pixel canvas
        slide_w = getattr(slide.part, "slide_width", 9144000) or 9144000
        slide_h = getattr(slide.part, "slide_height", 6858000) or 6858000
        scale_x = (width - 60) / slide_w
        scale_y = (height - 90) / slide_h

        for shape in shapes:
            try:
                left = int(shape.left * scale_x) + 30
                top = int(shape.top * scale_y) + 65
                w = int(shape.width * scale_x)
                h = int(shape.height * scale_y)

                draw.rectangle([left, top, left + w, top + h], fill=(225, 235, 250), outline=(80, 120, 180), width=2)
                if shape.has_text_frame and shape.text.strip():
                    text = shape.text.strip().replace("\n", " ")
                    draw.text((left + 8, top + 8), text[:40], fill=(20, 40, 70))
            except Exception:
                pass

        img.save(out_path)
