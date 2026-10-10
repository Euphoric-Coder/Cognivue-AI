import logging
import json
import re
from typing import List, Dict, Any, Tuple
from google import genai
from app.config import settings
from google.genai import types

logger = logging.getLogger(__name__)

def sanitize_assistant_answer(text: str) -> str:
    # Remove patterns like [CONTEXT_1], [CONTEXT_2], [[CONTEXT_1]], ([CONTEXT_1], [CONTEXT_2])
    cleaned = re.sub(r'\[?CONTEXT_\d+\]?', '', text)
    # Clean up empty parenthesis or brackets like () or (, ) resulting from deletion
    cleaned = re.sub(r'\(\s*(?:,\s*)*\)', '', cleaned)
    # Clean up stray commas left behind like "formula , ." -> "formula."
    cleaned = re.sub(r'\s*,\s*([.,])', r'\1', cleaned)
    # Clean up double spaces
    cleaned = re.sub(r'\s{2,}', ' ', cleaned)
    return cleaned.strip()

class LLMService:
    def __init__(self):
        if settings.gemini_api_key:
            self.client = genai.Client(api_key=settings.gemini_api_key)
        else:
            self.client = None

    def generate_grounded_answer(self, question: str, contexts: List[Dict[str, Any]], chat_history: List[Dict[str, str]] = None) -> Tuple[str, bool, List[str]]:
        """
        Returns (answer_text, is_grounded, list_of_context_ids_cited)
        """
        if not self.client:
            raise ValueError("LLM client is not configured (missing API key).")

        context_str = ""
        for i, ctx in enumerate(contexts):
            context_id = f"CONTEXT_{i+1}"
            context_str += f"[{context_id}]\n"
            context_str += f"Source: {ctx.get('sourceName', 'Unknown Source')}\n"
            if ctx.get("locationType") == "page":
                context_str += f"Location: Page {ctx.get('pageNumber', '?')}\n"
            elif ctx.get("locationType") == "slide":
                context_str += f"Location: Slide {ctx.get('slideNumber', '?')}\n"
            if ctx.get("sectionTitle"):
                context_str += f"Section: {ctx.get('sectionTitle')}\n"
            context_str += f"Content:\n{ctx.get('text', '')}\n\n"

        system_instruction = (
            "You are an AI Tutor strictly grounded in the provided course material.\n"
            "Use ONLY the supplied course context to answer the student's question.\n"
            "If the context does not contain enough information, state that the uploaded course material does not provide sufficient evidence.\n"
            "Every factual claim derived from course material must be supported by one or more source references.\n"
            "Never invent a source, page, slide, title, quotation, or citation.\n\n"
            "DO NOT include citation markers (like [CONTEXT_1]) in your natural language 'answer' string.\n"
            "You must provide citations EXCLUSIVELY in the 'citations' array.\n\n"
            "IMPORTANT: Your response MUST be valid JSON matching the following schema:\n"
            "{\n"
            '  "answer": "Your detailed answer written in Markdown.",\n'
            '  "citations": ["CONTEXT_1", "CONTEXT_3"],\n'
            '  "grounded": true\n'
            "}\n"
            "If you cannot answer the question from the context, set 'grounded' to false and explain why in 'answer'."
        )

        prompt = f"Course Context:\n{context_str}\n\nStudent Question:\n{question}"

        # Setup history
        contents = []
        if chat_history:
            for msg in chat_history:
                contents.append(
                    types.Content(
                        role=msg["role"], 
                        parts=[types.Part.from_text(text=msg["content"])]
                    )
                )
        
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=prompt)]
            )
        )

        try:
            response = self.client.models.generate_content(
                model=settings.llm_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=0.2,
                )
            )
            
            result_json = response.text
            parsed = json.loads(result_json)
            
            answer_text = parsed.get("answer", "Error generating answer.")
            answer_text = sanitize_assistant_answer(answer_text)
            
            return answer_text, parsed.get("grounded", False), parsed.get("citations", [])
            
        except Exception as e:
            logger.error(f"LLM Generation Error: {e}")
            return "An error occurred while generating the response.", False, []
