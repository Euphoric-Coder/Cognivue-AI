# Cognivue AI — Technical Demo & Judge Review Guide

## 1. Quick Access For Technical Reviewers

- **Frontend App**: `http://localhost:3000`
- **FastAPI Documentation**: `http://127.0.0.1:8000/docs`
- **Health Check**: `http://127.0.0.1:8000/api/health`
- **1-Click Demo**: From the Dashboard, click **"Explore Demo Course"**

---

## 2. API Endpoints Map

The FastAPI backend (`backend/app/main.py`) exposes endpoints across 7 core modules:

| Route Prefix | Module | Purpose |
| :--- | :--- | :--- |
| `/api/ingestion` | Ingestion | PDF/PPTX chunking, visual extraction, video transcription |
| `/api/tutor` | AI Tutor | Grounded RAG, Socratic dialogue, hint progression |
| `/api/knowledge-graph` | Knowledge Graph | Concept extraction, prerequisite discovery, DAG cycles |
| `/api/assessment` | Assessment | Grounded question generation, objective/subjective grading |
| `/api/learner-model` | Learner Model | Observations, continuous mastery update, recency decay |
| `/api/study-intelligence` | Study Plan | Daily focus lists, exam countdown, spaced review |
| `/api/evaluation` | Evaluation | Run quick/full suites, metrics aggregation, release gates |

---

## 3. Schema & Database Architecture (Convex)

Located in `convex/schema.js`, the system manages 16 strongly typed tables:
1. `users` (Clerk identity binding)
2. `courses` (Course metadata, graph status, `isDemo` flag)
3. `sources` (Uploaded files, type, mime, page/slide/video counts)
4. `sourceChunks` (Text chunks, section titles, page/slide/video location, 3072-dim embeddings)
5. `sourceVisuals` (Diagrams, charts, tables, video keyframe crops)
6. `transcriptSegments` (Audio segments with start/end millisecond timestamps)
7. `courseConcepts` (Concepts, importance, aliases, depth)
8. `conceptRelationships` (Prerequisites, addressed_by links, strength)
9. `conceptEvidence` (Traceability edges linking concepts to source chunks)
10. `assessments` & `assessmentQuestions` (Multi-type grounded questions)
11. `assessmentAttempts` & `assessmentResponses` (Student answers and rubrics)
12. `learnerConceptStates` (Persistent mastery, confidence, trend)
13. `learnerObservations` (Atomic evidence records with recency decay)
14. `learnerMasterySnapshots` (Historical course mastery progression)
15. `learnerMisconceptions` (Detected misunderstandings & severity)
16. `studyRecommendations`, `studyPlans`, `studyPlanItems`, `conceptReviewStates` (Personal study intelligence)

---

## 4. How to Run the Automated Test Suites

```bash
# 1. Run V12 Release Smoke Tests (9 tests)
backend/.venv/bin/python3 -m unittest tests/test_v12_release_smoke.py -v

# 2. Run V11 Full Evaluation Framework (15 benchmark suites)
backend/.venv/bin/python3 -m unittest tests/test_v11_evaluation_framework.py -v

# 3. Run Backend Unit Tests (54 tests across V8, V9, V10)
PYTHONPATH=backend backend/.venv/bin/python3 -m unittest discover -s backend/tests -v

# 4. Verify Frontend Linting
npm run lint
```
**Total Passing Tests**: 78 / 78 passing with 100% success rate. Zero ESLint errors.
