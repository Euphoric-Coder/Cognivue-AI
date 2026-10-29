import os
import json
import hashlib
import logging
import requests
from typing import List, Dict, Any, Optional
from convex import ConvexClient
from app.config import settings
from app.services.knowledge_graph.concept_extractor import ConceptExtractor
from app.services.knowledge_graph.concept_normalizer import ConceptNormalizer
from app.services.knowledge_graph.relationship_extractor import RelationshipExtractor
from app.services.knowledge_graph.graph_validator import GraphValidator

logger = logging.getLogger(__name__)

class KnowledgeGraphBuilder:
    """
    Orchestrates end-to-end Course Knowledge Graph generation
    using a Map-Reduce staged pipeline, grounded validation, and safe persistence.
    """

    def __init__(self):
        self.convex_client = ConvexClient(settings.convex_url)
        self.concept_extractor = ConceptExtractor()
        self.relationship_extractor = RelationshipExtractor()

    def compute_source_snapshot_hash(self, sources: List[Dict[str, Any]]) -> str:
        """Generates a deterministic hash representing the exact state of participating sources."""
        sorted_sources = sorted(sources, key=lambda s: str(s.get("_id", s.get("sourceId", ""))))
        repr_list = []
        for s in sorted_sources:
            repr_list.append(
                f"{s.get('_id')}:{s.get('updatedAt')}:{s.get('chunkCount')}:{s.get('visualCount')}:{s.get('ragStatus')}"
            )
        raw = "|".join(repr_list)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def update_graph_status(self, course_id: str, status: str, error: Optional[str] = None):
        """Updates graph build status in Convex."""
        url = f"{settings.convex_site_url}/knowledge-graph/status"
        headers = {"x-ingestion-secret": settings.ingestion_api_secret}
        payload = {
            "courseId": course_id,
            "status": status,
        }
        if error:
            payload["error"] = error

        try:
            res = requests.post(url, json=payload, headers=headers)
            res.raise_for_status()
        except Exception as e:
            logger.error(f"Failed to update graph status via HTTP: {e}")
            try:
                self.convex_client.mutation("knowledgeGraph:updateGraphStatusBackend", payload)
            except Exception as e2:
                logger.error(f"Failed to update graph status via mutation: {e2}")

    def build_course_knowledge_graph(self, course_id: str, user_id: str, force_rebuild: bool = False) -> Dict[str, Any]:
        """
        Executes the full knowledge graph generation pipeline for a course.
        """
        logger.info(f"KG_BUILD_START: courseId={course_id}, userId={user_id}, forceRebuild={force_rebuild}")
        self.update_graph_status(course_id, "building")

        try:
            # 1. Fetch all course data, sources, chunks, and visuals
            evidence_data = self.convex_client.query("knowledgeGraph:getBackendEvidenceData", {"courseId": course_id})
            if not evidence_data or not evidence_data.get("course"):
                raise ValueError(f"Course {course_id} not found or inaccessible.")

            course = evidence_data["course"]
            sources = evidence_data.get("sources", [])
            chunks = evidence_data.get("chunks", [])
            visuals = evidence_data.get("visuals", [])

            # Compute snapshot hash
            snapshot_hash = self.compute_source_snapshot_hash(sources)

            # Check idempotency: if not forced and snapshot matches and graph is ready, skip duplicate build
            if not force_rebuild and course.get("knowledgeGraphStatus") == "ready" and course.get("sourceSnapshotHash") == snapshot_hash:
                logger.info(f"KG_BUILD_SKIPPED_IDEMPOTENT: snapshot hash matches, no changes detected.")
                return {
                    "status": "ready",
                    "idempotent": True,
                    "conceptCount": course.get("conceptCount", 0),
                    "relationshipCount": course.get("relationshipCount", 0),
                }

            # Normalize evidence items into a unified collection
            evidence_collection = []

            # 1A. Text chunks and video transcript chunks
            for c in chunks:
                text = c.get("text", "").strip()
                if not text or len(text) < 20:
                    continue
                ev_type = c.get("evidenceType", "text")
                if c.get("locationType") == "video":
                    ev_type = "video_transcript" if ev_type == "text" else "video_visual"

                evidence_collection.append({
                    "sourceId": str(c.get("sourceId")),
                    "sourceName": c.get("sourceName") or next((s.get("name") for s in sources if str(s["_id"]) == str(c.get("sourceId"))), "Course Material"),
                    "evidenceType": ev_type,
                    "sourceChunkId": str(c.get("_id")),
                    "sourceVisualId": str(c.get("sourceVisualId")) if c.get("sourceVisualId") else None,
                    "pageNumber": c.get("pageNumber"),
                    "slideNumber": c.get("slideNumber"),
                    "startTime": c.get("startTime"),
                    "endTime": c.get("endTime"),
                    "visualType": c.get("visualType"),
                    "imageUrl": c.get("imageUrl"),
                    "text": text,
                })

            # 1B. Visual assets (diagrams, tables, charts, screenshots)
            for v in visuals:
                desc = v.get("description", "").strip()
                if not desc or len(desc) < 20:
                    continue
                v_type = v.get("visualType", "diagram")
                v_text = f"[Visual: {v_type.upper()}] Title: {v.get('title', 'Visual Asset')}\n{desc}"
                if v.get("extractedText"):
                    v_text += f"\nVisible text: {v.get('extractedText')}"

                ev_type = "video_visual" if v.get("locationType") == "video" else "visual"

                evidence_collection.append({
                    "sourceId": str(v.get("sourceId")),
                    "sourceName": next((s.get("name") for s in sources if str(s["_id"]) == str(v.get("sourceId"))), "Course Material"),
                    "evidenceType": ev_type,
                    "sourceVisualId": str(v.get("_id")),
                    "pageNumber": v.get("pageNumber"),
                    "slideNumber": v.get("slideNumber"),
                    "startTime": v.get("startTime"),
                    "endTime": v.get("endTime"),
                    "visualType": v_type,
                    "imageUrl": v.get("imageUrl"),
                    "text": v_text,
                })

            logger.info(f"KG_SOURCE_EVIDENCE_COLLECTED: totalEvidenceItems={len(evidence_collection)}, sourcesCount={len(sources)}")

            if not evidence_collection:
                logger.warning(f"No evidence found in course {course_id}. Marking ready with 0 concepts.")
                # Save empty graph
                self._save_to_convex(course_id, user_id, snapshot_hash, [], [], [])
                return {"status": "ready", "conceptCount": 0, "relationshipCount": 0}

            # 2. Stage 1: Map Phase - Extract candidate concepts in batches
            raw_candidates = []
            BATCH_SIZE = 6 # Process 6 evidence items per Gemini call for controlled token costs
            for b_idx in range(0, len(evidence_collection), BATCH_SIZE):
                batch = evidence_collection[b_idx:b_idx + BATCH_SIZE]
                candidates = self.concept_extractor.extract_from_evidence_batch(batch)
                raw_candidates.extend(candidates)

            logger.info(f"KG_CONCEPT_EXTRACTION: rawCandidatesCount={len(raw_candidates)}")

            # 3. Stage 2: Reduce Phase - Normalize and deduplicate concepts
            normalized_concepts = ConceptNormalizer.merge_concepts(raw_candidates)
            logger.info(f"KG_CONCEPT_MERGE: normalizedConceptsCount={len(normalized_concepts)}")

            # Extract flattened evidence items linked to each concept tempId
            flattened_evidence = []
            for c in normalized_concepts:
                temp_id = c["tempId"]
                for ev in c.get("evidence", []):
                    item = {
                        "conceptTempId": temp_id,
                        "sourceId": ev.get("sourceId"),
                        "sourceName": ev.get("sourceName", "Course Material"),
                        "evidenceType": ev.get("evidenceType", "text"),
                        "excerpt": ev.get("excerpt", "")[:400],
                        "confidence": ev.get("confidence", "high"),
                    }
                    if ev.get("sourceChunkId"):
                        item["sourceChunkId"] = ev["sourceChunkId"]
                    if ev.get("sourceVisualId"):
                        item["sourceVisualId"] = ev["sourceVisualId"]
                    if ev.get("pageNumber") is not None:
                        item["pageNumber"] = float(ev["pageNumber"])
                    if ev.get("slideNumber") is not None:
                        item["slideNumber"] = float(ev["slideNumber"])
                    if ev.get("startTime") is not None:
                        item["startTime"] = float(ev["startTime"])
                    if ev.get("endTime") is not None:
                        item["endTime"] = float(ev["endTime"])
                    if ev.get("visualType"):
                        item["visualType"] = ev["visualType"]
                    if ev.get("imageUrl"):
                        item["imageUrl"] = ev["imageUrl"]
                    if ev.get("confidenceScore") is not None:
                        item["confidenceScore"] = float(ev["confidenceScore"])
                    flattened_evidence.append(item)

            # 4. Stage 3: Infer Grounded Relationships
            raw_relationships = self.relationship_extractor.extract_relationships(
                normalized_concepts, evidence_collection
            )
            logger.info(f"KG_RELATIONSHIP_EXTRACTION: rawRelationshipsCount={len(raw_relationships)}")

            # 5. Stage 4: Graph Validation and Cycle Handling
            valid_concepts, valid_relationships, valid_evidence, warnings = GraphValidator.validate_and_sanitize(
                normalized_concepts, raw_relationships, flattened_evidence
            )
            for w in warnings:
                logger.warning(f"KG_VALIDATION_WARNING: {w}")

            logger.info(
                f"KG_VALIDATION: validConcepts={len(valid_concepts)}, validRelationships={len(valid_relationships)}, validEvidence={len(valid_evidence)}"
            )

            canonical_user_id = str(course.get("userId") or user_id)

            # 6. Stage 5: Save Atomically to Convex
            save_result = self._save_to_convex(
                course_id=course_id,
                user_id=canonical_user_id,
                snapshot_hash=snapshot_hash,
                concepts=valid_concepts,
                relationships=valid_relationships,
                evidence=valid_evidence,
            )

            logger.info(
                f"KG_BUILD_COMPLETE\nconcepts={len(valid_concepts)}\nrelationships={len(valid_relationships)}\nevidence={len(valid_evidence)}"
            )

            return {
                "status": "ready",
                "conceptCount": len(valid_concepts),
                "relationshipCount": len(valid_relationships),
                "evidenceCount": len(valid_evidence),
                "snapshotHash": snapshot_hash,
                "graphVersion": save_result.get("graphVersion", 1),
            }

        except Exception as e:
            logger.error(f"KG_BUILD_FAILED: courseId={course_id}, error={e}", exc_info=True)
            self.update_graph_status(course_id, "failed", str(e))
            raise e

    def _save_to_convex(
        self,
        course_id: str,
        user_id: str,
        snapshot_hash: str,
        concepts: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
        evidence: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Calls Convex HTTP or mutation to save the graph transactionally."""
        url = f"{settings.convex_site_url}/knowledge-graph/save"
        headers = {"x-ingestion-secret": settings.ingestion_api_secret}

        # Sanitize concepts payload so internal nested evidence is not duplicated/sent to Convex
        clean_concepts = []
        for c in concepts:
            clean_c = {
                "tempId": c["tempId"],
                "name": c["name"],
                "normalizedName": c["normalizedName"],
                "description": c.get("description", ""),
                "type": c.get("type", "concept"),
                "importance": c.get("importance", "supporting"),
                "sourceCount": float(c.get("sourceCount", 0)),
                "evidenceCount": float(c.get("evidenceCount", 0)),
                "aliases": c.get("aliases", []),
                "masteryEligible": bool(c.get("masteryEligible", True)),
            }
            clean_concepts.append(clean_c)

        clean_relationships = []
        for r in relationships:
            clean_r = {
                "fromTempId": r["fromTempId"],
                "toTempId": r["toTempId"],
                "relationType": r["relationType"],
                "confidence": r.get("confidence", "medium"),
            }
            if r.get("fromConceptName"):
                clean_r["fromConceptName"] = r["fromConceptName"]
            if r.get("toConceptName"):
                clean_r["toConceptName"] = r["toConceptName"]
            if r.get("confidenceScore") is not None:
                clean_r["confidenceScore"] = float(r["confidenceScore"])
            if r.get("explanation"):
                clean_r["explanation"] = r["explanation"]
            if r.get("evidenceSummary"):
                clean_r["evidenceSummary"] = r["evidenceSummary"]
            if r.get("evidenceIds"):
                clean_r["evidenceIds"] = r["evidenceIds"]
            clean_relationships.append(clean_r)

        clean_evidence = []
        for ev in evidence:
            clean_ev = {
                "conceptTempId": ev["conceptTempId"],
                "sourceId": ev["sourceId"],
                "sourceName": ev.get("sourceName", "Course Material"),
                "evidenceType": ev.get("evidenceType", "text"),
                "excerpt": ev.get("excerpt", "")[:400],
            }
            if ev.get("sourceChunkId"):
                clean_ev["sourceChunkId"] = ev["sourceChunkId"]
            if ev.get("sourceVisualId"):
                clean_ev["sourceVisualId"] = ev["sourceVisualId"]
            if ev.get("pageNumber") is not None:
                clean_ev["pageNumber"] = float(ev["pageNumber"])
            if ev.get("slideNumber") is not None:
                clean_ev["slideNumber"] = float(ev["slideNumber"])
            if ev.get("startTime") is not None:
                clean_ev["startTime"] = float(ev["startTime"])
            if ev.get("endTime") is not None:
                clean_ev["endTime"] = float(ev["endTime"])
            if ev.get("visualType"):
                clean_ev["visualType"] = ev["visualType"]
            if ev.get("imageUrl"):
                clean_ev["imageUrl"] = ev["imageUrl"]
            if ev.get("confidence"):
                clean_ev["confidence"] = ev["confidence"]
            if ev.get("confidenceScore") is not None:
                clean_ev["confidenceScore"] = float(ev["confidenceScore"])
            clean_evidence.append(clean_ev)

        payload = {
            "courseId": course_id,
            "userId": user_id,
            "snapshotHash": snapshot_hash,
            "concepts": clean_concepts,
            "relationships": clean_relationships,
            "evidence": clean_evidence,
        }

        try:
            res = requests.post(url, json=payload, headers=headers)
            res.raise_for_status()
            return res.json()
        except Exception as e:
            logger.warning(f"HTTP save failed ({e}), falling back to direct ConvexClient mutation")
            return self.convex_client.mutation("knowledgeGraph:saveKnowledgeGraphBackend", payload)
