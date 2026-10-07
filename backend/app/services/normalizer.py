import re

def normalize_text(text: str) -> str:
    if not text:
        return ""
    
    # Remove null bytes or weird control characters (except common ones like \n, \t)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)
    
    # Normalize unicode whitespace (like non-breaking spaces) to regular spaces
    text = re.sub(r'[^\S\n]+', ' ', text)
    
    # Normalize multiple newlines to max two newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Strip leading/trailing whitespace
    return text.strip()
