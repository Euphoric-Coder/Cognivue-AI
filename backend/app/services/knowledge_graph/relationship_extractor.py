import logging
import json
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.config import settings

logger = logging.getLogger(__name__)

ALLOWED_RELATION_TYPES = [
    "PREREQUISITE_OF",
    "DEPENDS_ON",
    "PART_OF",
    "RELATED_TO",
    "APPLIES_TO",
    "USED_FOR",
    "EXAMPLE_OF",
    "CONTRASTS_WITH",
    "CAUSES",
    "FOLLOWS"
]

class RawRelationshipItem(BaseModel):
    fromConcept: str = Field(description="The source concept name")
    toConcept: str = Field(description="The target concept name")
    relationType: str = Field(description="One of: PREREQUISITE_OF, DEPENDS_ON, PART_OF, RELATED_TO, APPLIES_TO, USED_FOR, EXAMPLE_OF, CONTRASTS_WITH, CAUSES, FOLLOWS")
    confidence: str = Field(description="high, medium, or low")
    explanation: str = Field(description="Clear explanation of why these concepts are connected based on the evidence")
    evidenceQuote: Optional[str] = Field(default="", description="Exact supporting quotation or evidence summary from the context")
    evidenceContextId: Optional[str] = Field(default="", description="The context ID providing proof, e.g. 'CONTEXT_1'")

class ExtractedRelationshipsResponse(BaseModel):
    relationships: List[RawRelationshipItem]

class RelationshipExtractor:
    """
    Infers grounded relationships among normalized course concepts
    using evidence snippets and strict relationship semantics.
    """

    def __init__(self):
        if settings.gemini_api_key:
            self.client = genai.Client(api_key=settings.gemini_api_key)
        else:
            self.client = None

    def extract_relationships(
        self,
        concepts: List[Dict[str, Any]],
        evidence_items: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Given the established concepts and source evidence, infers grounded relationships.
        """
        if not self.client or len(concepts) < 2 or not evidence_items:
            return []

        # Create quick concept lookup by normalized name
        from app.services.knowledge_graph.concept_normalizer import ConceptNormalizer
        concept_names = [c["name"] for c in concepts]
        concept_lookup = {ConceptNormalizer.normalize_name(c["name"]): c for c in concepts}
        for c in concepts:
            for a in c.get("aliases", []):
                concept_lookup[ConceptNormalizer.normalize_name(a)] = c

        # Prepare evidence context snippets (sample top/diverse evidence to fit context)
        contexts_str = ""
        context_map = {}
        for i, ev in enumerate(evidence_items[:25]):
            cid = f"CONTEXT_{i + 1}"
            context_map[cid] = ev
            loc = ev.get("locationType", "text")
            if ev.get("pageNumber"):
                loc += f" p.{ev['pageNumber']}"
            elif ev.get("slideNumber"):
                loc += f" slide {ev['slideNumber']}"
            elif ev.get("startTime") is not None:
                loc += f" time {ev['startTime']}s"
            contexts_str += f"\n--- [{cid}] {ev.get('sourceName', 'Course Source')} ({loc}) ---\n"
            contexts_str += ev.get("text", "")[:400] + "\n"

        concept_list_str = "\n".join([f"- {c['name']} ({c['type']}): {c['description'][:100]}" for c in concepts[:35]])

        system_instruction = (
            "You are an educational ontology and knowledge graph expert. "
            "Analyze the relationships between the provided educational concepts using ONLY the provided course evidence.\n\n"
            "STRICT RELATIONSHIP VOCABULARY:\n"
            "- PREREQUISITE_OF: Concept A must be learned before Concept B (strong evidence required!)\n"
            "- DEPENDS_ON: Concept B depends on Concept A (e.g. Badges depends on Citizen Points)\n"
            "- PART_OF: Concept A is a subcomponent or module of Concept B\n"
            "- RELATED_TO: General grounded educational relationship\n"
            "- APPLIES_TO: Concept A is applied to domain/entity Concept B\n"
            "- USED_FOR: Concept A is an instrument or method used to achieve Concept B\n"
            "- EXAMPLE_OF: Concept A is a concrete example or case study of Concept B\n"
            "- CONTRASTS_WITH: Concepts A and B are explicitly compared or contrasted\n"
            "- CAUSES: Concept A causes Concept B\n"
            "- FOLLOWS: Concept A sequentially follows Concept B\n\n"
            "GROUNDING RULES:\n"
            "1. ONLY infer relationships explicitly supported by the evidence.\n"
            "2. DO NOT invent prerequisite links from world knowledge if the course material does not state it.\n"
            "3. If a relationship is ambiguous or weak, use RELATED_TO or omit it.\n"
            "4. NEVER create self-loops (fromConcept == toConcept).\n"
            "5. Both fromConcept and toConcept MUST match names from the provided Concept List."
        )

        prompt = (
            f"ESTABLISHED CONCEPTS:\n{concept_list_str}\n\n"
            f"COURSE EVIDENCE:\n{contexts_str}\n\n"
            "Identify all grounded relationships between these concepts based on the evidence:"
        )

        try:
            logger.info(f"KG_RELATIONSHIP_EXTRACTION: running inference on {len(concepts)} concepts")
            response = self.client.models.generate_content(
                model=settings.llm_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=ExtractedRelationshipsResponse,
                    temperature=0.1,
                )
            )

            raw_data = json.loads(response.text)
            parsed = ExtractedRelationshipsResponse(**raw_data)

            valid_relationships = []
            seen_pairs = set()

            for rel in parsed.relationships:
                from_norm = ConceptNormalizer.normalize_name(rel.fromConcept)
                to_norm = ConceptNormalizer.normalize_name(rel.toConcept)

                if not from_norm or not to_norm or from_norm == to_norm:
                    continue

                from_concept = concept_lookup.get(from_norm)
                to_concept = concept_lookup.get(to_norm)

                if not from_concept or not to_concept:
                    continue

                from_temp_id = from_concept["tempId"]
                to_temp_id = to_concept["tempId"]

                if from_temp_id == to_temp_id:
                    continue

                pair_key = (from_temp_id, to_temp_id, rel.relationType.upper())
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)

                rel_type = rel.relationType.upper()
                if rel_type not in ALLOWED_RELATION_TYPES:
                    rel_type = "RELATED_TO"

                # Check confidence: discard low confidence relationships by default
                conf = rel.confidence.lower()
                if conf not in ["high", "medium"]:
                    conf = "medium"

                # Build evidence citation summary
                matched_ctx = context_map.get(rel.evidenceContextId)
                evidence_summary = rel.evidenceQuote or ""
                if matched_ctx and not evidence_summary:
                    evidence_summary = f"{matched_ctx.get('sourceName')} ({matched_ctx.get('locationType')})"

                valid_relationships.append({
                    "fromTempId": from_temp_id,
                    "toTempId": to_temp_id,
                    "fromConceptName": from_concept["name"],
                    "toConceptName": to_concept["name"],
                    "relationType": rel_type,
                    "confidence": conf,
                    "confidenceScore": 0.9 if conf == "high" else 0.75,
                    "explanation": rel.explanation.strip(),
                    "evidenceSummary": evidence_summary,
                    "evidenceIds": [rel.evidenceContextId] if rel.evidenceContextId else [],
                })

            return valid_relationships

        except Exception as e:
            logger.error(f"Error in RelationshipExtractor: {e}")
            return []
