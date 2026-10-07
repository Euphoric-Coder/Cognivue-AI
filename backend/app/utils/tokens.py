import tiktoken

def estimate_tokens(text: str) -> int:
    try:
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text, disallowed_special=()))
    except Exception:
        # Fallback if tiktoken fails
        return len(text.split()) * 1.3
