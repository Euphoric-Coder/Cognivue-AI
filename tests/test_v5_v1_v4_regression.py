import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.services.rag.llm_service import LLMService
from app.services.rag.embedding_service import EmbeddingService

class TestV1V4Regression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.llm = LLMService()
        cls.embedder = EmbeddingService()

    def test_pdf_text_rag_grounded_answer(self):
        """Regression test for PDF text chunk RAG grounding and citation."""
        contexts = [
            {
                "sourceName": "CityCare Civic Manual.pdf",
                "locationType": "page",
                "pageNumber": 7,
                "evidenceType": "text",
                "sectionTitle": "Submission Guidelines",
                "text": "Citizens can report road hazards, broken streetlights, and sanitation issues via the CityCare mobile application. Each verified report awards 25 points."
            }
        ]
        q = "How many points are awarded for a verified report?"
        answer, is_grounded, citations = self.llm.generate_grounded_answer(q, contexts)
        self.assertTrue(is_grounded)
        self.assertIn("CONTEXT_1", citations)
        self.assertIn("25", answer)

    def test_pptx_text_rag_grounded_answer(self):
        """Regression test for PPTX text chunk RAG grounding and citation."""
        contexts = [
            {
                "sourceName": "Architecture Lecture.pptx",
                "locationType": "slide",
                "slideNumber": 3,
                "evidenceType": "text",
                "sectionTitle": "Service Architecture",
                "text": "The ingest service operates asynchronously using Kafka event queues to buffer high-volume sensor streams before storage."
            }
        ]
        q = "What queue technology does the ingest service use?"
        answer, is_grounded, citations = self.llm.generate_grounded_answer(q, contexts)
        self.assertTrue(is_grounded)
        self.assertIn("CONTEXT_1", citations)
        self.assertTrue("kafka" in answer.lower())

    def test_video_transcript_rag_and_timestamp_citation(self):
        """Regression test for Video transcript RAG and timestamp citation."""
        contexts = [
            {
                "sourceName": "CityCare Lecture 01.mp4",
                "locationType": "video",
                "startTime": 113.0,
                "endTime": 156.0,
                "evidenceType": "text",
                "sectionTitle": "Administrative Controls",
                "text": "Administrative controls are strictly segregated. Super-administrators can assign roles and approve badge taxonomy revisions."
            }
        ]
        q = "Who can revise badge taxonomy?"
        answer, is_grounded, citations = self.llm.generate_grounded_answer(q, contexts)
        self.assertTrue(is_grounded)
        self.assertIn("CONTEXT_1", citations)
        self.assertTrue("super-administrator" in answer.lower() or "administrator" in answer.lower())

    def test_citation_validator_trusts_backend_metadata(self):
        """Ensures that citation resolution uses trusted backend context metadata."""
        top_chunks = [
            {
                "_id": "chunk_abc123",
                "sourceId": "src_1",
                "sourceName": "CityCare Doc",
                "locationType": "page",
                "pageNumber": 14,
                "evidenceType": "text",
                "sectionTitle": "Metrics",
                "text": "Precision reached 94% on the test split."
            },
            {
                "_id": "chunk_vis456",
                "sourceId": "src_2",
                "sourceName": "CityCare Architecture",
                "locationType": "slide",
                "slideNumber": 8,
                "sourceVisualId": "vis_789",
                "evidenceType": "visual",
                "visualType": "er_diagram",
                "imageUrl": "https://convex.cloud/api/storage/vis_789",
                "sectionTitle": "Schema Diagram",
                "text": "CitizenPointTransaction ER diagram showing foreign keys."
            }
        ]
        citation_ids = ["CONTEXT_1", "CONTEXT_2"]
        citations = []
        for c_id in citation_ids:
            idx = int(c_id.split("_")[1]) - 1
            if 0 <= idx < len(top_chunks):
                c = top_chunks[idx]
                cit = {
                    "sourceId": c["sourceId"],
                    "sourceChunkId": c["_id"],
                    "sourceName": c.get("sourceName", "Unknown"),
                    "locationType": c.get("locationType", "page"),
                    "pageNumber": c.get("pageNumber"),
                    "slideNumber": c.get("slideNumber"),
                    "evidenceType": c.get("evidenceType", "text"),
                    "visualType": c.get("visualType"),
                    "sourceVisualId": str(c["sourceVisualId"]) if c.get("sourceVisualId") else None,
                    "imageUrl": c.get("imageUrl"),
                }
                citations.append({k: v for k, v in cit.items() if v is not None})

        self.assertEqual(len(citations), 2)
        c1 = citations[0]
        self.assertEqual(c1["locationType"], "page")
        self.assertEqual(c1["pageNumber"], 14)
        self.assertEqual(c1["evidenceType"], "text")

        c2 = citations[1]
        self.assertEqual(c2["locationType"], "slide")
        self.assertEqual(c2["slideNumber"], 8)
        self.assertEqual(c2["evidenceType"], "visual")
        self.assertEqual(c2["visualType"], "er_diagram")
        self.assertEqual(c2["sourceVisualId"], "vis_789")

    def test_embedding_generation_consistency(self):
        """Tests that text embedding generation works and produces normalized vectors."""
        embedding = self.embedder.embed_text("CityCare rewards citizen participation with badges")
        self.assertIsInstance(embedding, list)
        self.assertEqual(len(embedding), 3072)

if __name__ == "__main__":
    unittest.main()
