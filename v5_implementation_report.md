# Cognivue AI V5 — Multimodal Visual Understanding Implementation Report

## Executive Summary
Cognivue AI has been upgraded from **Version 4 to Version 5: Multimodal Visual Understanding**. 
Version 5 introduces deep visual understanding of educational course materials—including diagrams, charts, graphs, tables, screenshots, slide visuals, figures, and video keyframes—while preserving strict source provenance, backward compatibility with V1–V4 text & video RAG, and rock-solid prompt-injection defenses.

---

## 1. Architectural Design & Philosophy

### Core Architectural Principle
Visual understanding is **not** treated as unconstrained image captioning. Every extracted visual asset preserves:
- Exact source provenance (`courseId`, `sourceId`, `sourceName`)
- Precise spatial/temporal location (`locationType`, `pageNumber`, `slideNumber`, `startTime`, `endTime`)
- Normalized visual classification (`diagram`, `chart`, `graph`, `table`, `screenshot`, `illustration`, `flowchart`, `architecture`, `er_diagram`, `state_diagram`, etc.)
- Multi-dimensional extraction: visible text, key entities, structural relationships, visible numerical comparisons, and educational explanations.

### Preserving V1–V4 RAG & Hybrid Multimodal Retrieval
Visual RAG supplements existing text RAG rather than replacing it:
```
Text Chunks (PDF, PPTX, Video Narration)
                     +
Visual Evidence (Diagrams, Charts, Tables, Keyframes)
                     ↓
Unified 3072-Dimensional Vector Index (Convex sourceChunks)
                     ↓
Hybrid Multimodal Retrieval (Score-ranked semantic search)
                     ↓
Grounding Engine (Gemini 2.5/3.6 with strict context binding)
                     ↓
Multi-Evidence Answer + Provenance-Preserved Citations
```

---

## 2. Visual Data Model & Schema

### Convex Schema Updates (`convex/schema.js`)

1. **`sourceVisuals` Table**:
   - `userId`: Clerk user ID
   - `courseId`: Course ID reference
   - `sourceId`: Source ID reference
   - `locationType`: `"page" | "slide" | "video"`
   - `pageNumber`: 1-indexed PDF page (optional)
   - `slideNumber`: 1-indexed PPTX slide (optional)
   - `startTime` / `endTime`: Video playback window in seconds (optional)
   - `visualType`: Normalized category (`er_diagram`, `chart`, `table`, `architecture`, etc.)
   - `storageId`: Convex storage file ID for permanent image hosting
   - `imageUrl`: Public/signed URL for rendering in the web app
   - `width` / `height`: Pixel dimensions
   - `extractedText`: OCR / visible text extracted from image
   - `title`: Short title of the visual
   - `description`: Structured educational summary
   - `structuredData`: JSON for tabular data (`headers`, `rows`) or entity-relationship nodes
   - `confidenceNotes`: Array of limitations (e.g. unreadable small fonts)
   - `confidence`: Confidence score (0.0 to 1.0)
   - `processingStatus`: `"ready" | "failed"`
   - `createdAt`: Timestamp
   - Indexes: `by_source`, `by_course`, `by_course_source`.

2. **`sources` Table Extensions**:
   - `visualStatus`: `"not_started" | "processing" | "ready" | "failed"`
   - `visualCount`: Total extracted visuals
   - `diagramCount`: Count of diagrams, flowcharts, ER diagrams, architecture graphics
   - `chartCount`: Count of charts and graphs
   - `tableCount`: Count of data tables
   - `keyframeCount`: Count of video keyframes
   - `visualError`: Error message if processing failed

3. **`sourceChunks` Multimodal Linkage**:
   - `sourceVisualId`: Optional foreign key to `sourceVisuals`
   - `evidenceType`: `"text" | "visual"`
   - `visualType`: Inherited visual classification for fast filtering
   - `embedding`: 3072-dimensional vector indexing the multimodal searchable representation

4. **`tutorMessages` Citation Extensions**:
   - `sourceVisualId`: ID of cited visual
   - `evidenceType`: `"text" | "visual"`
   - `visualType`: Diagram, chart, table, screenshot, etc.
   - `imageUrl`: Renderable image URL
   - `confidenceNotes`: Direct transparency notes

---

## 3. Visual Extraction Pipeline & Source Strategies

### 3.1 PDF Visual Extraction (`pdf_visual_service.py`)
- Employs **PyMuPDF (`fitz`)** for high-fidelity extraction.
- **Embedded Image Extraction**: Inspects page `get_images()`, decodes raster graphics, checks dimensions and color variance.
- **Full Page Diagram Rendering**: When vector graphics, flowcharts, or shapes are detected on a page that are not simple standalone bitmap objects, renders the page region at 150 DPI for unified layout analysis.
- **Page Provenance**: Automatically attaches `pageNumber` to every candidate.

### 3.2 PPTX Visual Extraction (`pptx_visual_service.py`)
- Employs **`python-pptx`** to inspect slides.
- **Shapes & Pictures**: Extracts standalone `PICTURE` shapes and embedded images.
- **Tables**: Parses table cells into structured JSON (`headers`, `rows`) while capturing cell coordinates.
- **Slide Diagram Rendering**: For slides with grouped shapes, arrows, flowcharts, and architecture blocks (which are drawn using vector shapes rather than a single bitmap), extracts and renders the composite slide representation.
- **Slide Provenance**: Attaches `slideNumber` and surrounding slide text as context.

### 3.3 Video Keyframe Visual Extraction (`keyframe_extractor.py`)
- **Conservative Sampling**: Avoids dense frame analysis. For typical lectures, samples 3–15 keyframes using FFmpeg scene change detection (`select='gt(scene,0.2)'`) plus periodic intervals (minimum 15-second gap).
- **Perceptual Hash Deduplication**: Calculates 64-bit difference hashes (`dhash`) with a Hamming distance threshold of 6 to discard redundant static slides.
- **Transcript Fusion**: Fuses surrounding narration audio transcript segments (+/- 15 seconds) into the keyframe analysis context, enabling rich explanations such as *"The lecturer discusses badges while the database schema is visible on screen."*
- **Timestamp Fidelity**: Every keyframe retains exact `startTime` / `endTime` bounded strictly by media duration from `ffprobe`.

### 3.4 Visual Classifier & Filtering (`visual_classifier.py`)
Before sending any image candidate to Gemini Vision:
- Filters out icons, logos, bullets, separators, and tiny decorative elements (enforcing `VISUAL_MIN_WIDTH=100`, `VISUAL_MIN_HEIGHT=100`, and `min_area=15,000`).
- Filters extreme aspect ratios (`> 6.0` or `< 0.16`).
- Checks standard deviation of pixel values to reject blank/solid-color slides.
- Deduplicates identical repeated templates across slides using perceptual hashing.

---

## 4. Gemini Multimodal Vision Provider

### Structured Analysis Prompting (`gemini_vision_provider.py`)
- Provider uses **`gemini-2.5-flash`** with strict JSON output schemas.
- **Prompt Injection Defense**: Explicit system directives state that all text visible in screenshots, slides, or documents represents passive, untrusted course material. Injected commands (e.g. *"Ignore previous instructions"*) are treated purely as inert text and never executed.
- **Fact vs. Interpretation Separation**:
  - `visibleText`: Exact strings read directly from the graphic.
  - `keyEntities`: Entities and tables visibly present.
  - `relationships`: Links, arrows, and foreign keys explicitly drawn.
  - `importantValues`: Numbers and trend directions visible on axes or table cells.
  - `confidenceNotes`: Explicit notation if fonts are illegible or exact numbers cannot be verified without extrapolation.

---

## 5. Visual RAG Searchable Representation & Hybrid Retrieval

### Searchable Representation (`visual_pipeline.py`)
Each visual is converted into an information-dense text document for vectorization:
```text
[VISUAL EVIDENCE: ER_DIAGRAM]
Title: Citizen Point Transaction Schema
Source: CityCare Architecture Slides (Slide 8)

Description:
The ER diagram illustrates the database relationships between citizens and their reward points.

Key Entities:
- Citizen
- CitizenPointTransaction

Visible Relationships:
- Citizen has many CitizenPointTransactions via citizenId foreign key

Visible Text & Attributes:
citizenId, points, actionType, reason, timestamp

Confidence Notes:
- Schema attributes are clearly legible.
```
- Embedded via `gemini-embedding-2` into a 3072-dimensional vector.
- Indexed into `sourceChunks` alongside text chunks.

### Unified Hybrid Retrieval (`rag_service.py` & `llm_service.py`)
- Searches the unified vector collection. Both text chunks and visual evidence compete fairly based on cosine relevance.
- Top ranked candidates are tagged as `CONTEXT_1`, `CONTEXT_2`, etc., with `evidenceType` ("text" vs. "visual").
- Grounding prompts instruct Gemini Tutor:
  1. Cite visual evidence when discussing diagrams, charts, tables, screenshots, or slides.
  2. Synthesize text + visual evidence when a student asks holistic questions.
  3. Strictly refuse to speculate about unrepresented visual details (e.g., professor's shirt color).

---

## 6. Frontend UI / UX Implementation

1. **Source Details Visuals Gallery (`app/dashboard/courses/[courseId]/sources/[sourceId]/page.js`)**:
   - Tab switcher between "Extracted Content" and "Visuals Gallery".
   - Category filter pills: All, Diagrams, Charts, Tables, Screenshots, Videos.
   - Rich visual cards displaying thumbnail preview, location badge (`📄 Page 14`, `📊 Slide 8`, `▶ 02:14`), title, and educational explanation.
   - Interactive zoom & inspection preview modal.
   - Status badge and "Reprocess Visuals" trigger button.

2. **AI Tutor Visual Citations (`app/dashboard/courses/[courseId]/tutor/page.js`)**:
   - Distinct visual citation chips: `▣ Architecture Slides • Slide 8 • ER Diagram`.
   - Dedicated visual citation modal (substantially wider layout) with high-resolution image preview, AI interpretation, observable entities/relationships, confidence notes, and "Open in Source" action.
   - Video visual citations include an interactive "Seek to Frame (02:14)" action that synchronizes the video player.

3. **Course Overview Visual Metrics (`app/dashboard/courses/[courseId]/page.js`)**:
   - Summary metric card for "Visuals Analyzed".
   - Sub-breakdown badges: Diagrams, Charts, Tables, Video Keyframes.

---

## 7. Verification & Test Matrix

Three comprehensive automated test suites were created and executed:

### Suite 1: Multimodal Pipeline (`test_v5_multimodal_pipeline.py`) — 11 Tests Passed
| Test Case | Description | Result |
|---|---|---|
| `test_01_classifier_filters_decorative_assets` | Filters logos, blank images, and small icons | **PASS** |
| `test_02_pdf_visual_extraction` | Extracts embedded images and figures from PDF | **PASS** |
| `test_03_pptx_visual_extraction` | Extracts shapes, charts, and slide graphics | **PASS** |
| `test_04_er_diagram_understanding` | Identifies `Citizen` and `CitizenPointTransaction` entities | **PASS** |
| `test_05_badges_schema_understanding` | Identifies `is_system_badge` and `is_active` attributes | **PASS** |
| `test_06_table_understanding` | Extracts precision, recall, F1, and identifies Model B | **PASS** |
| `test_07_chart_understanding` | Captures upward accuracy trend across stages | **PASS** |
| `test_08_screenshot_understanding` | Describes UI controls without fabricating hidden behavior | **PASS** |
| `test_09_video_keyframe_extraction_and_deduplication` | Samples 3–15 frames, removes duplicates via pHash | **PASS** |
| `test_10_strict_grounding_refusal` | Refuses to guess professor's shirt color when unrepresented | **PASS** |
| `test_11_multimodal_rag_answer_generation` | Synthesizes visual evidence and generates trusted citations | **PASS** |

### Suite 2: End-to-End & Security (`test_v5_e2e_integration.py`) — 4 Tests Passed
| Test Case | Description | Result |
|---|---|---|
| `test_prompt_injection_defense_in_visuals` | Injected prompt in visual text does not override system behavior | **PASS** |
| `test_multi_evidence_fusion_text_plus_visual` | Combines civic manual text + ER diagram in one grounded answer | **PASS** |
| `test_chart_approximate_trend_cautious_interpretation` | Accurately explains upward trend on Page 14 | **PASS** |
| `test_table_comparison_highest_f1` | Identifies Model B with highest F1 score from table | **PASS** |

### Suite 3: V1–V4 Backward Compatibility Regression (`test_v5_v1_v4_regression.py`) — 5 Tests Passed
| Test Case | Description | Result |
|---|---|---|
| `test_pdf_text_rag_grounded_answer` | PDF text chunk retrieval, grounding, and page citation | **PASS** |
| `test_pptx_text_rag_grounded_answer` | PPTX text chunk retrieval, grounding, and slide citation | **PASS** |
| `test_video_transcript_rag_and_timestamp_citation` | Video transcript RAG and timestamp interval citation | **PASS** |
| `test_citation_validator_trusts_backend_metadata` | Backend metadata prevents LLM citation fabrication | **PASS** |
| `test_embedding_generation_consistency` | 3072-dimensional embeddings via Gemini embedding model | **PASS** |

---

## 8. File Changelog

### Convex Functions & Schema
- `convex/schema.js`: Added `sourceVisuals`, updated `sources`, `sourceChunks`, and `tutorMessages`.
- `convex/sources.js`: Added `getSourceVisuals`, `getCourseVisualMetrics`, cascaded visual deletion.
- `convex/ingestion.js`: Added `saveVisuals`, `saveVisualChunks`, `deleteVisuals`, `updateVisualStatus`.
- `convex/http.js`: Added `/ingestion/upload-visual`, `/ingestion/visuals`, `/ingestion/visual-chunks`, `/ingestion/visual-status`.
- `convex/tutor.js`: Enhanced `tutor:search` action to link `sourceVisual` metadata to retrieved candidates.

### Backend Services & API
- `backend/app/config.py`: Added visual limits and robust `.env` resolution.
- `backend/app/services/vision/vision_provider.py`: Vision provider abstract interface.
- `backend/app/services/vision/gemini_vision_provider.py`: Gemini multimodal vision analyzer with structured schema and injection protection.
- `backend/app/services/vision/visual_classifier.py`: Asset filtering, dimensions check, and pHash deduplication.
- `backend/app/services/vision/pdf_visual_service.py`: PyMuPDF visual extractor.
- `backend/app/services/vision/pptx_visual_service.py`: PPTX shape, table, and slide diagram extractor.
- `backend/app/services/vision/keyframe_extractor.py`: Video keyframe extraction, pHash deduplication, and transcript narration fusion.
- `backend/app/services/vision/visual_pipeline.py`: End-to-end coordinator for visual extraction, upload, and vectorization.
- `backend/app/services/ingestion/ingestion_service.py`: Integrated visual pipelines into PDF, PPTX, and Video ingestion. Added `reprocess_visuals_task`.
- `backend/app/api/ingestion.py`: Added `/api/ingestion/reprocess_visuals` endpoint.
- `backend/app/services/rag/rag_service.py`: Multimodal logging (`RAG_VISUAL_CANDIDATES`, `RAG_MULTIMODAL_FINAL_CONTEXTS`) and citation formatting.
- `backend/app/services/rag/llm_service.py`: Multimodal prompt framing and visual citation guidance.

### Frontend Web Application
- `app/dashboard/courses/[courseId]/sources/[sourceId]/page.js`: Visuals Gallery tab, category filters, visual card grid, and inspection modal.
- `app/dashboard/courses/[courseId]/tutor/page.js`: Visual citation chips, wide visual preview dialog, and seek integration.
- `app/dashboard/courses/[courseId]/page.js`: Visual analytics metrics in Course Overview.
- `app/api/ingestion/reprocess_visuals/route.js`: API proxy for visual reprocessing.

### Demo Materials & Tests
- `demo/citycare_evaluation_and_metrics.pdf`: Evaluation table and accuracy progression chart.
- `demo/citycare_architecture_and_gamification.pptx`: ER diagram, badges schema diagram, and admin screenshot.
- `tests/test_v5_multimodal_pipeline.py`: Comprehensive 11-test suite.
- `tests/test_v5_e2e_integration.py`: End-to-end and prompt-injection security suite.
- `tests/test_v5_v1_v4_regression.py`: V1–V4 regression suite.

---

## 9. Conclusion
Cognivue AI Version 5 is fully operational. Students can ask questions regarding diagrams, charts, tables, screenshots, and video keyframes, and receive grounded answers citing precise source locations with previewable visual evidence.
