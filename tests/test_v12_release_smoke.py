import os
import sys
import json
import tempfile
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.services.evaluation.evaluation_runner import EvaluationRunner

class TestV12ReleaseSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.evals_dir = ROOT_DIR / "evals"
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.runs_dir = Path(cls.temp_dir.name) / "runs"
        cls.runner = EvaluationRunner(evals_dir=cls.evals_dir, runs_dir=cls.runs_dir)

        with open(cls.evals_dir / "fixtures.json", "r", encoding="utf-8") as f:
            cls.fixtures = json.load(f)

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def test_01_backend_health_and_version(self):
        """Verifies backend /api/health endpoint returns V12 status and model info."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["version"], "12.0.0")
        self.assertEqual(data["release"], "v12_hackathon_final")
        self.assertIn("models", data)
        self.assertEqual(data["models"]["llm"], settings.llm_model)

    def test_02_request_id_and_timing_middleware(self):
        """Verifies x-request-id and x-response-time-ms headers are attached."""
        custom_id = "test-custom-uuid-12345"
        response = self.client.get("/api/health", headers={"x-request-id": custom_id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("x-request-id"), custom_id)
        self.assertTrue(response.headers.get("x-response-time-ms") is not None)

    def test_03_root_endpoint_metadata(self):
        """Verifies root endpoint documentation link and service status."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("service", data)
        self.assertEqual(data["version"], "12.0.0")

    def test_04_fixtures_multimodal_integrity(self):
        """Verifies multimodal fixture completeness (PDF, PPTX, Video, Visuals, Timestamps)."""
        sources = self.fixtures["sources"]
        self.assertGreaterEqual(len(sources), 3)
        types = {s["type"] for s in sources}
        self.assertIn("pdf", types)
        self.assertIn("pptx", types)
        self.assertIn("video", types)

        # Verify video has durationSeconds
        video_src = next(s for s in sources if s["type"] == "video")
        self.assertEqual(video_src.get("durationSeconds"), 2400)

        # Verify chunks contain text, visual, and transcript locations
        chunks = self.fixtures["chunks"]
        loc_types = {c["locationType"] for c in chunks}
        self.assertIn("page", loc_types)
        self.assertIn("slide", loc_types)
        self.assertIn("video", loc_types)

        # Verify video timestamp chunks
        vid_chunks = [c for c in chunks if c["locationType"] == "video"]
        self.assertGreaterEqual(len(vid_chunks), 3)
        for vc in vid_chunks:
            self.assertIn("startTime", vc)
            self.assertIn("endTime", vc)
            self.assertLess(vc["startTime"], vc["endTime"])

    def test_05_knowledge_graph_fixtures_integrity(self):
        """Verifies knowledge graph concepts and relationships are fully connected."""
        concepts = self.fixtures["concepts"]
        relationships = self.fixtures["relationships"]
        self.assertGreaterEqual(len(concepts), 7)
        self.assertGreaterEqual(len(relationships), 3)

        concept_ids = {c["_id"] for c in concepts}
        for rel in relationships:
            self.assertIn(rel["fromConceptId"], concept_ids)
            self.assertIn(rel["toConceptId"], concept_ids)
            self.assertIn(rel["relationType"], ["PREREQUISITE_OF", "ADDRESSED_BY"])
            self.assertTrue(len(rel["evidenceIds"]) > 0)

    def test_06_grounded_rag_smoke(self):
        """Verifies grounded RAG evaluator on calculus test cases."""
        run = self.runner.run_evaluation(run_type="rag")
        self.assertEqual(run["status"], "completed")
        self.assertGreaterEqual(run["passedCount"], 5)
        metrics = {m["metricName"]: m["value"] for m in run["metrics"]}
        self.assertGreaterEqual(metrics.get("rag_faithfulness", 0), 0.85)
        self.assertGreaterEqual(metrics.get("citation_accuracy", 0), 0.90)

    def test_07_grounded_refusal_and_security_smoke(self):
        """Verifies out-of-syllabus refusal and isolation guardrails."""
        run = self.runner.run_evaluation(run_type="security")
        self.assertEqual(run["status"], "completed")
        self.assertEqual(run["passedCount"], run["caseCount"])
        metrics = {m["metricName"]: m["value"] for m in run["metrics"]}
        self.assertEqual(metrics.get("security_pass_rate"), 1.0)
        self.assertEqual(metrics.get("security.isolationPass"), 1.0)
        self.assertEqual(metrics.get("security.userIsolationPass"), 1.0)

    def test_08_multimodal_and_visual_understanding_smoke(self):
        """Verifies visual charts, tables, and keyframes evaluate accurately."""
        run = self.runner.run_evaluation(run_type="multimodal")
        self.assertEqual(run["status"], "completed")
        self.assertEqual(run["passedCount"], run["caseCount"])

    def test_09_study_intelligence_and_adaptive_tutor_smoke(self):
        """Verifies recommendation logic correctly prioritizes weak prerequisites."""
        run_study = self.runner.run_evaluation(run_type="study_intelligence")
        self.assertEqual(run_study["status"], "completed")
        self.assertEqual(run_study["passedCount"], run_study["caseCount"])

        run_tutor = self.runner.run_evaluation(run_type="adaptive_tutor")
        self.assertEqual(run_tutor["status"], "completed")
        self.assertEqual(run_tutor["passedCount"], run_tutor["caseCount"])

if __name__ == "__main__":
    unittest.main()
