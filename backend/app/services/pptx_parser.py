from pptx import Presentation
from app.services.normalizer import normalize_text
import logging

logger = logging.getLogger(__name__)

def parse_pptx(file_path: str):
    """
    Extracts text from a PPTX slide by slide.
    Yields (slide_number, extracted_text, slide_title).
    """
    try:
        prs = Presentation(file_path)
    except Exception as e:
        logger.error(f"Failed to open PPTX: {e}")
        raise ValueError("Could not open PPTX file.")

    for i, slide in enumerate(prs.slides):
        texts = []
        slide_title = ""
        
        if slide.shapes.title and slide.shapes.title.text:
            slide_title = normalize_text(slide.shapes.title.text)
            
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text:
                texts.append(shape.text)
                
        # Join all text in the slide
        full_text = "\n".join(texts)
        normalized = normalize_text(full_text)
        
        yield {
            "slideNumber": i + 1,  # 1-based index
            "slideTitle": slide_title,
            "text": normalized
        }
