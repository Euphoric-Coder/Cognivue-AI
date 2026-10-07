import fitz  # PyMuPDF
from app.services.normalizer import normalize_text
import logging

logger = logging.getLogger(__name__)

def parse_pdf(file_path: str):
    """
    Extracts text from a PDF page by page.
    Yields (page_number, extracted_text).
    """
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        logger.error(f"Failed to open PDF: {e}")
        raise ValueError("Could not open or parse PDF file. It might be corrupted or encrypted.")

    if doc.needs_pass:
        raise ValueError("PDF is encrypted and requires a password.")

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text()
        
        # We don't want to fail processing if some pages are empty, but we can skip fully empty pages
        normalized = normalize_text(text)
        
        yield {
            "pageNumber": page_num + 1,  # 1-based index
            "text": normalized
        }
