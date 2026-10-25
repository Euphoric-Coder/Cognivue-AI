import os
import sys
import tempfile
import unittest

# Ensure backend is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.config import settings
from app.services.vision.visual_classifier import VisualClassifier
from app.services.vision.pdf_visual_service import PDFVisualService
from app.services.vision.pptx_visual_service import PPTXVisualService
from app.services.video.keyframe_extractor import KeyframeExtractor
from app.services.vision.gemini_vision_provider import GeminiVisionProvider
from app.services.rag.llm_service import LLMService

class TestV5MultimodalVisualUnderstanding(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.demo_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "demo"))
        cls.pdf_path = os.path.join(cls.demo_dir, "citycare_evaluation_and_metrics.pdf")
        cls.pptx_path = os.path.join(cls.demo_dir, "citycare_architecture_and_gamification.pptx")
        cls.video_path = os.path.join(cls.demo_dir, "CityCare_Citizen_Engagement___Gamification_Briefing.mp4")
        cls.er_img_path = os.path.join(cls.demo_dir, "er_diagram.png")
        cls.table_img_path = os.path.join(cls.demo_dir, "eval_table.png")
        cls.chart_img_path = os.path.join(cls.demo_dir, "accuracy_chart.png")
        cls.screenshot_img_path = os.path.join(cls.demo_dir, "admin_screenshot.png")
        cls.badges_img_path = os.path.join(cls.demo_dir, "badges_diagram.png")
        cls.vision_provider = GeminiVisionProvider()

    def test_01_visual_classifier_filtering(self):
        """Validates that tiny icons, blank images, and aspect ratio extremes are filtered."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            from PIL import Image

            # 1. Tiny icon (30x30)
            tiny_path = os.path.join(tmp_dir, "tiny_icon.png")
            Image.new("RGB", (30, 30), color=(100, 100, 100)).save(tiny_path)
            is_valid, reason, _ = VisualClassifier.is_useful_visual(tiny_path)
            self.assertFalse(is_valid, "Tiny image should be filtered")
            self.assertIn("too small", reason.lower())

            # 2. Extreme aspect ratio (600x10 line separator)
            line_path = os.path.join(tmp_dir, "line_sep.png")
            Image.new("RGB", (600, 10), color=(100, 100, 100)).save(line_path)
            is_valid, reason, _ = VisualClassifier.is_useful_visual(line_path)
            self.assertFalse(is_valid, "Line separator should be filtered")

            # 3. Solid blank white image (400x300)
            blank_path = os.path.join(tmp_dir, "blank.png")
            Image.new("RGB", (400, 300), color=(255, 255, 255)).save(blank_path)
            is_valid, reason, _ = VisualClassifier.is_useful_visual(blank_path)
            self.assertFalse(is_valid, "Solid blank image should be filtered")

            # 4. Valid educational visual
            is_valid, reason, dims = VisualClassifier.is_useful_visual(self.er_img_path)
            self.assertTrue(is_valid, f"ER diagram should be valid candidate: {reason}")
            self.assertIsNotNone(dims)

    def test_02_pdf_visual_extraction(self):
        """Validates extraction of images/diagrams from PDF with exact page locations."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            candidates = PDFVisualService.extract_visuals_from_pdf(self.pdf_path, tmp_dir)
            self.assertGreaterEqual(len(candidates), 2, "PDF should yield at least 2 visual candidates (table + chart)")
            
            # Check page numbers
            page_numbers = [c["pageNumber"] for c in candidates]
            self.assertIn(1, page_numbers, "Page 1 visual must be detected")
            self.assertIn(2, page_numbers, "Page 2 visual must be detected")
            
            for c in candidates:
                self.assertEqual(c["locationType"], "page")
                self.assertTrue(os.path.exists(c["imagePath"]))
                self.assertGreater(c["width"], 100)
                self.assertGreater(c["height"], 100)

    def test_03_pptx_visual_extraction(self):
        """Validates extraction of images/shapes/tables from PPTX with exact slide numbers."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            candidates = PPTXVisualService.extract_visuals_from_pptx(self.pptx_path, tmp_dir)
            self.assertGreaterEqual(len(candidates), 3, "PPTX should yield at least 3 candidates (ER, Badges, Screenshot)")

            slide_numbers = [c["slideNumber"] for c in candidates]
            self.assertIn(1, slide_numbers, "Slide 1 ER diagram must be detected")
            self.assertIn(2, slide_numbers, "Slide 2 Badges diagram must be detected")
            self.assertIn(3, slide_numbers, "Slide 3 Admin screenshot must be detected")

            for c in candidates:
                self.assertEqual(c["locationType"], "slide")
                self.assertTrue(os.path.exists(c["imagePath"]))

    def test_04_diagram_understanding_er(self):
        """Validates Gemini Vision understanding of ER diagram (entities and attributes)."""
        analysis = self.vision_provider.analyze_image(self.er_img_path, context="CityCare Architecture")
        self.assertIn(analysis["visualType"], ["diagram", "er_diagram", "architecture"])
        
        entities_text = " ".join(analysis["keyEntities"]).lower()
        visible_text = " ".join(analysis["visibleText"]).lower()
        explanation = analysis["educationalExplanation"].lower()
        combined = entities_text + " " + visible_text + " " + explanation

        # Must mention citizen and point transaction
        self.assertTrue("citizen" in combined, "Must identify Citizen entity")
        self.assertTrue("point" in combined or "transaction" in combined, "Must identify PointTransaction")
        # Attributes
        self.assertTrue("citizenid" in combined or "points" in combined or "actiontype" in combined or "reason" in combined, 
                        "Must extract visible schema attributes")

    def test_05_diagram_understanding_badges(self):
        """Validates Gemini Vision extraction of specific schema flags (is_system_badge, is_active)."""
        analysis = self.vision_provider.analyze_image(self.badges_img_path, context="Badges schema")
        combined = (" ".join(analysis["visibleText"]) + " " + analysis["educationalExplanation"]).lower()
        self.assertTrue("is_system_badge" in combined or "system" in combined, "Must detect system badge attribute")
        self.assertTrue("is_active" in combined or "active" in combined, "Must detect is_active attribute")

    def test_06_table_understanding(self):
        """Validates structured table extraction and comparative analysis."""
        analysis = self.vision_provider.analyze_image(self.table_img_path, context="Model performance evaluation")
        self.assertEqual(analysis["visualType"], "table")
        
        # Check explanation identifies Model B as having highest F1 / best performance
        exp = analysis["educationalExplanation"].lower()
        self.assertTrue("model b" in exp or "0.94" in exp or "highest" in exp, 
                        "Table explanation should identify Model B performance")

    def test_07_chart_understanding(self):
        """Validates chart understanding (stages, upward progression)."""
        analysis = self.vision_provider.analyze_image(self.chart_img_path, context="Accuracy progression")
        self.assertIn(analysis["visualType"], ["chart", "graph"])
        
        exp = analysis["educationalExplanation"].lower()
        self.assertTrue("stage" in exp or "accura" in exp or "increas" in exp or "trend" in exp,
                        "Chart explanation should identify training stages or accuracy trend")

    def test_08_screenshot_understanding(self):
        """Validates UI screenshot understanding describing observable elements."""
        analysis = self.vision_provider.analyze_image(self.screenshot_img_path, context="Admin dashboard")
        self.assertIn(analysis["visualType"], ["screenshot", "unknown", "diagram"])
        exp = analysis["educationalExplanation"].lower()
        self.assertTrue("admin" in exp or "dashboard" in exp or "moderation" in exp or "control" in exp or "issue" in exp,
                        "Screenshot should identify dashboard or administrative controls")

    def test_09_video_keyframe_extraction_and_deduplication(self):
        """Validates conservative keyframe extraction and duplicate suppression on video."""
        if not os.path.exists(self.video_path):
            self.skipTest("Demo video file not found")

        with tempfile.TemporaryDirectory() as tmp_dir:
            from app.services.video.ffmpeg_service import FFmpegService
            duration = FFmpegService.get_duration(self.video_path)
            self.assertGreater(duration, 10.0, "Video duration should be positive")

            keyframes = KeyframeExtractor.extract_keyframes(self.video_path, tmp_dir, duration)
            # Conservative check: between 1 and 15 frames
            self.assertGreaterEqual(len(keyframes), 1)
            self.assertLessEqual(len(keyframes), 15)

            # Check timestamp bounds: no keyframe may exceed actual duration
            for kf in keyframes:
                self.assertEqual(kf["locationType"], "video")
                self.assertGreaterEqual(kf["startTime"], 0.0)
                self.assertLessEqual(kf["startTime"], duration)
                self.assertLessEqual(kf["endTime"], duration)
                self.assertTrue(os.path.exists(kf["imagePath"]))

    def test_10_strict_grounding_refusal(self):
        """Validates that AI Tutor refuses questions about unsupported visual details."""
        llm = LLMService()
        fake_contexts = [
            {
                "sourceName": "CityCare Architecture",
                "locationType": "slide",
                "slideNumber": 1,
                "evidenceType": "visual",
                "visualType": "er_diagram",
                "sectionTitle": "Citizen Schema",
                "text": "The ER diagram shows Citizen entity with citizenId, totalPoints, and PointTransaction entity.",
            }
        ]
        # Ask question not supported in context
        unsupported_q = "What color was the lecturer's shirt in the lecture video?"
        answer, is_grounded, citations = llm.generate_grounded_answer(unsupported_q, fake_contexts)
        
        # Grounded should be False, and answer should indicate lack of evidence
        self.assertFalse(is_grounded, "Tutor must not claim grounded on unsupported question")
        ans_lower = answer.lower()
        self.assertTrue("not provide" in ans_lower or "sufficient" in ans_lower or "color" in ans_lower or "cannot" in ans_lower or "does not" in ans_lower,
                        "Answer should refuse or state lack of evidence")

    def test_11_multimodal_grounded_answer_and_citations(self):
        """Validates that tutor answers questions combining visual evidence with citations."""
        llm = LLMService()
        contexts = [
            {
                "sourceName": "CityCare Architecture Slides",
                "locationType": "slide",
                "slideNumber": 1,
                "evidenceType": "visual",
                "visualType": "er_diagram",
                "sectionTitle": "Citizen Point Transaction Schema",
                "text": (
                    "[Visual Evidence: ER_DIAGRAM]\n"
                    "Title: Citizen Point Transaction Schema\n"
                    "Entities: Citizen, CitizenPointTransaction\n"
                    "Visible Schema Attributes: citizenId, points, actionType, reason\n"
                    "Relationships: Citizen receives PointTransaction (1:N relationship)"
                ),
            }
        ]
        q = "What entities and attributes are shown in the Citizen Point Transaction diagram?"
        answer, is_grounded, citations = llm.generate_grounded_answer(q, contexts)

        self.assertTrue(is_grounded, "Response should be grounded")
        self.assertIn("CONTEXT_1", citations, "Should cite CONTEXT_1")
        ans_lower = answer.lower()
        self.assertTrue("citizen" in ans_lower and "point" in ans_lower, "Answer should explain the schema entities")

if __name__ == "__main__":
    unittest.main()
