# Cognivue AI — Version 11 Implementation Report (Evaluation & Benchmarking)

## Overview
Cognivue AI has been upgraded from **Version 10 (Personal Study Intelligence)** to **Version 11: System Evaluation & Benchmarking** while preserving all existing V1–V10 functionality.

All metrics in V11 are computed strictly from stored test cases, real Cognivue backend components, and recorded evaluation outputs (`test case -> system output -> evaluation -> stored result -> aggregate metric`). Zero hard-coded or fabricated demo percentages exist.

---

## Key Capabilities Implemented

### 1. Convex Evaluation Data Model & Ownership Isolation
- Added four schema tables in `convex/schema.js` with typed fields and composite indexes:
  - `evaluationRuns` (`by_user`, `by_user_run_type`, `by_user_baseline`)
  - `evaluationCases` (`by_run`, `by_run_case`, `by_user_category`)
  - `evaluationResults` (`by_run`, `by_run_passed`, `by_run_category`, `by_run_case`)
  - `evaluationMetrics` (`by_run`, `by_run_category`)
- Created `convex/evaluations.js` with Clerk-authenticated queries and mutations (`getEvaluationRuns`, `getBaselineRun`, `getEvaluationRunDetails`, `createEvaluationRun`, `updateEvaluationRun`, `saveEvaluationBatch`, `setBaselineRun`, `recordHumanOverride`, `deleteEvaluationRun`).
- Human review overrides (`recordHumanOverride`) store reviewer judgment inside `humanOverride` while preserving original automated `passed`, `scores`, and `failureReasons` intact.
- Updated `convex/_generated/api.d.ts` to register the `evaluations` module (run `npx convex dev` / `npx convex codegen` when connected to sync cloud deployment).

### 2. Versioned Benchmark Dataset (`evals/`)
- `evals/dataset_manifest.json` (`datasetVersion: "cognivue-eval-v1"`, `quickSuiteCaseIds` defining 20 representative cases across all 9 categories)
- `evals/fixtures.json` (isolated course fixtures across PDF notes, PPTX slides, timestamped video transcript chunks spanning early/mid/late timeline, visual chart/table/keyframe chunks, plus an isolated secondary course/user fixture)
- Category suites totaling **39 isolated cases**:
  - `evals/rag_cases.json` (6 cases: supported factual, multi-source synthesis, early & late video timeline + full-chunk coverage invariant, unanswerable negative refusal, false-refusal guard)
  - `evals/multimodal_cases.json` (4 cases: chart trend + unlabelled-decimal safety, table comparison, video keyframe click-to-seek timestamp validation, missing-visual refusal)
  - `evals/graph_cases.json` (3 cases: gold graph precision/recall, `ConceptNormalizer` duplicate/alias merging, `GraphValidator` ungrounded pruning & prerequisite cycle breaking)
  - `evals/assessment_cases.json` (4 cases: all 8 Cognivue question types validated via `QuestionValidator`, MCQ `"All of the above"` distractor rejection, `DuplicateDetector` paraphrase catching, insufficient-evidence refusal via `AssessmentPlanner`)
  - `evals/grading_cases.json` (6 cases: objective MCQ/MSQ/numerical tolerance, subjective short-answer MAE & bands, adversarial prompt-injection defense via `GradingService`)
  - `evals/learner_model_cases.json` (4 cases: monotonicity, observation-key deduplication / zero double-counting, single-easy-question low-confidence guard, recency attenuation via `MasteryEngine` & `ConfidenceEngine`)
  - `evals/adaptive_cases.json` (4 cases: mastery depth & scaffolding adaptation, fact-grounding invariance, Socratic escape override, Hint progression 1–4, misconception clarification injection via `PedagogyEngine`, `MisconceptionService`, `AdaptivePromptBuilder`)
  - `evals/study_intelligence_cases.json` (4 cases: priority ranking, prerequisite blocker flagging, unassessed `"not_assessed"` labeling, spaced review interval expansion/contraction + daily budget, closed-loop fail -> study -> mastery increase & priority decrease)
  - `evals/security_cases.json` (4 cases: cross-course retrieval isolation, cross-user ownership boundary, tutor prompt-injection refusal, LLM-judge prompt-injection immunity)

### 3. Modular Evaluation Engine (`backend/app/services/evaluation/`)
- `versioning.py` — Stamps `datasetVersion`, `evaluatorVersion`, `modelVersion`, `embeddingModel`, `visionModel`, `promptVersions`, retrieval configuration, and `ragas`/`deepeval` availability.
- `base_evaluator.py` — Shared tokenization, claim splitting, refusal detection, prompt-injection detection, and `PromptInjectionHardenedJudge` (supports deterministic RAGAS-aligned judging offline and structured live Gemini judging with untrusted-output isolation when explicitly enabled).
- Category Evaluators: `retrieval_evaluator.py`, `citation_evaluator.py`, `rag_evaluator.py`, `multimodal_evaluator.py`, `graph_evaluator.py`, `assessment_evaluator.py`, `grading_evaluator.py`, `learner_model_evaluator.py`, `adaptive_tutor_evaluator.py`, `study_intelligence_evaluator.py`, `security_evaluator.py`.
- `metrics_aggregator.py` — Computes exact `numerator / denominator` metrics, latency percentiles (`meanMs`, `p50Ms`, `p95Ms`, `maxMs`), judge/token/cost estimates, and failure counts by category.
- `regression_evaluator.py` — Computes baseline metric deltas/regression alerts and enforces the Critical Release Gate (automatically failing on cross-user/cross-course leaks, fabricated citations, objective grading errors, or learner-model double-counting, plus configurable metric thresholds).
- `evaluation_runner.py` — Supports `quick_suite`, `full_suite`, and per-category execution, `maxCases` cost caps, async run status tracking, JSON persistence (`evals/runs/`, git-ignored), and JSON/Markdown report rendering.
- `docs/evaluation_metrics.md` — Documents all formulas, aggregation rules, release gates, and known offline vs live-LLM assumptions.

### 4. FastAPI Endpoints & Next.js Internal Evaluation Console
- Backend routes (`backend/app/api/evaluation.py`, schemas in `backend/app/schemas/evaluation.py`, wired in `backend/app/main.py` at `/api/evaluation`): `/metadata`, `/estimate`, `/run`, `/runs`, `/runs/{run_id}`, `/runs/{run_id}/status`, `/compare`, `/runs/{run_id}/export`. Never auto-runs on startup.
- Next.js Clerk-authenticated proxy (`app/api/evaluation/route.js`) checking both Clerk `auth()` and operator dev/flag gating (`NODE_ENV !== "production"` or `NEXT_PUBLIC_ENABLE_EVAL_DASHBOARD === "true"`).
- Internal UI (`app/dashboard/evaluations/page.js` with `components/evaluations/run-evaluation-dialog.jsx`, `components/evaluations/evaluation-table.jsx`, and `components/evaluations/failed-case-inspector.jsx`) + dev/operator sidebar link in `components/dashboard/dashboard-wrapper.jsx`.

---

## Executed Benchmark Results (`eval_a64f0c2ce786`)

Executed via `EvaluationRunner().run_evaluation(run_type="full_suite", use_live_llm=False)` and exported to `evaluation_report.json` and `evaluation_report.md`:

- **Dataset / Evaluator / Model**: `cognivue-eval-v1` / `eval-v1.0` / `gemini-3.6-flash` (`judgeMode: deterministic_offline`, as `ragas`, `deepeval`, and outbound Gemini network access are not present/enabled in the offline sandbox)
- **Cases Evaluated**: `39 / 39` passed (`100.0%` overall pass rate, `0` failed, `0` critical failures)
- **Release Gate**: `PASS`
- **Subsystem Summary**:
  - `overall_pass_rate`: `100.0%` (`39 / 39`)
  - `rag_pass_rate`: `100.0%` (`6 / 6`), `rag_faithfulness`: `100.0%` (`6.0 / 6`), `rag_context_relevance`: `100.0%` (`6.0 / 6`), `citation_accuracy`: `100.0%` (`6.0 / 6`), `grounded_refusal_accuracy`: `100.0%` (`6.0 / 6`), `rag.videoCoverage`: `100.0%` (`6.0 / 6`)
  - `multimodal_pass_rate`: `100.0%` (`4 / 4`)
  - `knowledge_graph_pass_rate`: `100.0%` (`3 / 3`), `knowledge_graph.evidenceTraceability`: `100.0%` (`2.0 / 2`)
  - `assessment_pass_rate`: `100.0%` (`4 / 4`), `assessment.questionTypeCoverage`: `100.0%` (`1.0 / 1`)
  - `grading_pass_rate`: `100.0%` (`6 / 6`), `objective_grading_accuracy`: `100.0%` (`3.0 / 3`), `grading.subjectiveMae`: `0.0` (`0.0 / 2`), `grading.gradingInjectionDefense`: `100.0%` (`1.0 / 1`)
  - `learner_model_pass_rate`: `100.0%` (`4 / 4`)
  - `adaptive_tutor_pass_rate`: `100.0%` (`4 / 4`)
  - `study_intelligence_pass_rate`: `100.0%` (`4 / 4`)
  - `security_pass_rate`: `100.0%` (`4 / 4`)
- **Measured Latency & Judge Usage**:
  - `meanMs`: `0.08 ms`, `p50Ms`: `0.03 ms`, `p95Ms`: `0.35 ms`, `maxMs`: `0.84 ms`
  - `judgeCalls`: `6`, `promptTokens`: `1227`, `completionTokens`: `120`, `estimatedCostUsd`: `$0.000171` (offline deterministic aligned mode)

---

## Verification Summary (Post-Final-Edit)

1. `PYTHONPATH=backend backend/.venv/bin/python3 -m unittest tests/test_v11_evaluation_framework.py -v` -> **15 passed, 0 failed** (`OK`).
2. `PYTHONPATH=backend backend/.venv/bin/python3 -m unittest discover -s backend/tests -v` (V8 Learner Model, V9 Adaptive Tutor, V10 Study Intelligence) -> **54 passed, 0 failed** (`OK`).
3. `PYTHONPATH=backend backend/.venv/bin/python3 -m unittest tests.test_v6_knowledge_graph tests.test_v7_assessment_engine -v` -> **18 passed, 2 failed** (`test_v7_assessment_engine` passed `10/10` via offline fallback; `test_v6_knowledge_graph` passed `8/10` with `test_04_relationship_extraction_and_grounding` and `test_10_v1_v5_regression_stability` failing with `403 Forbidden` because outbound requests to `generativelanguage.googleapis.com` are blocked by the sandbox network policy).
4. `npm run lint` -> **0 errors** (15 pre-existing `@next/next/no-img-element` / `exhaustive-deps` / generated-file warnings in untouched V1–V10 files; 0 errors/warnings in new V11 files).
5. `npx esbuild convex/*.js --bundle --outdir=/tmp/convex-bundle-test --platform=node` + schema index verification -> **All Convex modules bundled cleanly (`evaluations.js` 97.5kb); all queried indexes verified against `convex/schema.js`**.
6. `npx convex dev` / live Next.js `next build` (Google Fonts download) were not executed due to offline sandbox network restrictions.

