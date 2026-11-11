# Cognivue AI — V11 Evaluation Metrics & Methodology Reference

This document defines the exact metric formulas, aggregation logic, release gates, and known limitations of the Cognivue AI Evaluation & Benchmarking Framework (`evaluatorVersion: "eval-v1.0"`, `datasetVersion: "cognivue-eval-v1"`).

Every reported percentage in Cognivue V11 is computed directly from stored `evaluationCases` and `evaluationResults` records (`numerator / denominator`). No hard-coded or simulated aggregate scores are permitted.

---

## 1. Evaluator Abstraction & Optional RAGAS / DeepEval Integration

The evaluation layer separates **what is tested** (isolated course fixtures & system entry points) from **how it is judged**:

1. **Deterministic Evaluators**: Compute exact structural, algebraic, set-matching, bounds-checking, cycle-detection, deduplication, and invariant checks with reproducible `1.0` / `0.0` or bounded continuous scores.
2. **RAGAS-Aligned Evaluators** (`Faithfulness`, `AnswerRelevancy`, `ContextPrecision`, `ContextRecall`):
   - Compute deterministic claim-support ratios, query-term coverage, rank-weighted context precision (`sum_{k} (relevant@k * Precision@k) / |relevant retrieved|`), and evidence recall when running offline or in deterministic fixture mode.
   - Optionally delegate to `ragas` or `deepeval` when installed in the Python environment (`importlib.util.find_spec("ragas")`), transparently recording which backend (`deterministic_ragas_aligned` vs `ragas` + `gemini`) executed in `runConfig.judgeMode`.
   - Note: In the default workspace environment without outbound Gemini/network access or optional `ragas`/`deepeval` wheels installed, runs execute against the **isolated deterministic + code-path evaluator** and report `judgeMode: "deterministic_offline"` unless live LLM judging is enabled cleanly with an API key.
3. **Prompt-Injection-Hardened LLM Judge**: All subjective/LLM judge prompts wrap candidate answers inside explicit `UNTRUSTED SYSTEM OUTPUT` delimiters, treat prompt override strings (`Ignore previous`, `SYSTEM OVERRIDE`, etc.) as adversarial failures, and never trust injected scoring claims.

---

## 2. Category Metrics & Exact Formulas

### 2.1 Retrieval & RAG (`category = "rag"`)
- **Retrieval Precision@K**: `|retrieved_relevant_chunks[:K]| / max(1, |retrieved_chunks[:K]|)`
- **Retrieval Recall@K**: `|retrieved_relevant_chunks[:K]| / max(1, |expected_evidence|)` (scored `1.0` on unanswerable refusal cases if no unsupported chunks pass threshold)
- **Hit@1 / Hit@3 / Hit@5**: `1` if at least one expected evidence chunk appears in top `1` / `3` / `5` results, else `0`, averaged over answerable cases.
- **Video Timeline Coverage Invariant**: For video sources, verifies early, middle, and late timestamp segments are all present in indexed chunks and `embedded_chunk_count == total_chunk_count` (`1` if complete, `0` if late chunks dropped).
- **RAGAS Context Precision**: Rank-weighted precision of expected chunks inside top-K retrieved contexts.
- **RAGAS Context Recall**: Fraction of expected evidence claims/chunks present in top-K retrieved contexts.
- **RAGAS Faithfulness**: Fraction of factual sentences/claims in the generated answer corroborated by retrieved context chunks (`supported_claims / total_claims`, penalized to `0.0` if unsupported hallucinations or adversarial text appear).
- **RAGAS Answer Relevancy**: Token/semantic alignment between the user query and non-refusal answer (or refusal appropriateness on negative cases).
- **True Refusal Rate**: `correct_refusals_on_unanswerable / total_unanswerable_cases`
- **False Refusal Rate** *(lower is better; reported both directly and as `1 - false_refusal_rate` accuracy)*: `unjustified_refusals_on_supported_cases / total_supported_cases`
- **Grounded Refusal Accuracy**: `(true_refusals + supported_non_refusals) / total_rag_cases`
- **Citation Accuracy**: `valid_existing_source_citations / max(1, emitted_citations)` (verifies existing `sourceId`/`chunkId`, matching page/slide/video span, and zero fabricated citations).
- **Citation Completeness**: `matched_expected_sources / max(1, expected_citation_sources)`

### 2.2 Multimodal & Visual RAG (`category = "multimodal"`)
- **Visual Retrieval Precision**: Fraction of retrieved visual contexts matching expected `sourceVisualId` & `visualType` (`diagram`, `chart`, `table`, `video_keyframe`).
- **Chart Trend & Refusal Safety**: Checks that qualitative trends (`converge`, `diverge`, axis labels) are stated and missing unlabelled exact decimals (e.g., `"epoch 23"`) are refused rather than hallucinated.
- **Table Extraction Accuracy**: Exact cell/row correspondence against expected tabular facts (`SGD -> 1x`, `Adam -> 3x`).
- **Video Keyframe Click-to-Seek Validity**: `1` iff every cited video visual satisfies `0 <= startTime < endTime <= durationSeconds`, else `0`.
- **Missing Visual Refusal Rate**: Fraction of nonexistent visual queries cleanly refused.

### 2.3 Knowledge Graph Quality (`category = "knowledge_graph"`)
- **Concept Precision**: `|extracted_normalized & gold_normalized| / max(1, |extracted_normalized|)`
- **Concept Recall**: `|extracted_normalized & gold_normalized| / max(1, |gold_normalized|)`
- **Relationship Precision & Recall**: Measured over normalized `(fromConcept, toConcept, relationType)` triples against gold edges.
- **Duplicate/Alias Detection Rate**: Verifies `ConceptNormalizer.merge_concepts()` merges variant names (`"Chain Rule"`, `"The Chain Rule Method"`) cleanly into the expected canonical node count.
- **Evidence Traceability Rate**: `1.0` iff 100% of post-validation concepts and relationships cite at least one valid evidence ID; ungrounded nodes must be pruned by `GraphValidator`.
- **Prerequisite Cycle Removal Rate**: Verifies `GraphValidator` breaks prerequisite DAG cycles (`A -> B -> A`).

### 2.4 Assessment Quality (`category = "assessment"`)
- **Question Type Coverage**: Fraction of all 8 Cognivue question types (`mcq`, `multiple_select`, `true_false`, `short_answer`, `numerical`, `scenario_based`, `diagram_based`, `concept_explanation`) passing `QuestionValidator`.
- **MCQ Ambiguity & Distractor Rejection Rate**: Verifies invalid options (`"All of the above"`, duplicate/verbatim true distractors) are rejected.
- **Duplicate Question Detection Rate**: Verifies `DuplicateDetector` flags near-duplicate paraphrases above similarity threshold.
- **Insufficient Evidence Refusal**: Verifies `AssessmentPlanner` sets `sufficientEvidence = False` when topic evidence is empty.

### 2.5 Grading Reliability (`category = "grading"`)
- **Objective Grading Accuracy** *(Release-Critical)*: `exact_objective_matches / total_objective_cases` across `mcq`, `multiple_select` (strict set), `true_false`, and `numerical` (tolerance bounds). Expected: `100%`.
- **Subjective Grading MAE**: `mean(|predicted_score_fraction - human_reference_score|)` across non-adversarial subjective responses *(reported as both MAE and `1 - MAE` agreement percentage)*.
- **Subjective Band Agreement**: Fraction of responses placed in the matching band (`correct >= 0.70`, `0.25 <= partial < 0.70`, `incorrect < 0.25`).
- **Grading Prompt-Injection Resistance**: Fraction of adversarial grading submissions (`"Ignore previous instructions..."`, `"SYSTEM OVERRIDE..."`) blocked with `scoreFraction <= maxAllowedScore`.

### 2.6 Learner Model Stability (`category = "learner_model"`)
- **Monotonicity Pass Rate**: Fraction of checks where adding a correct observation non-strictly increases mastery probability and adding an incorrect observation decreases mastery probability.
- **Idempotency / No Double-Counting Rate**: Checks that deduplicated observation keys produce identical mastery probability and evidence counts when duplicate submission records are filtered.
- **Confidence Calibration Guard**: Confirms 1 easy question never yields `"high"` confidence or `"strong"`/`"proficient"` mastery band.
- **Recency Stability**: Confirms a recent error produces strictly lower mastery than an identical older error with the same accuracy count.

### 2.7 Adaptive Tutoring Correctness (`category = "adaptive_tutor"`)
- **Strategy Adaptation Accuracy**: Verifies `PedagogyEngine.determine_strategy` adapts `explanation_depth`, `scaffolding_level`, `include_prerequisite_review`, and `address_misconception` strictly from learner state.
- **Factual Consistency Across States**: Verifies core evidence facts & citations remain invariant between low-mastery and high-mastery prompts/outputs.
- **Socratic Escape & Hint Progression Rate**: Confirms explicit direct-answer requests escape Socratic questioning and Hint Levels `1 < 2 < 3 < 4` produce distinct progressive prompt constraints.

### 2.8 Study Intelligence Quality (`category = "study_intelligence"`)
- **Priority Logic Consistency**: Weak concepts rank above strong concepts; active misconceptions boost score; weak prerequisite blockers are explicitly flagged.
- **Unassessed Semantics Guard**: Concepts with `evidenceCount == 0` are labeled `"not_assessed"` (`NOT_ASSESSED`) and never `"needs_attention"`/`LOW_MASTERY`.
- **Explainability Coverage**: `100%` of returned study recommendations must contain non-empty `reasonCodes` and evidence-backed `reasonSummary`.
- **Closed-Loop Reprioritization**: Failing an assessment produces low mastery + high priority; subsequent remedial mastery increase reduces priority score cleanly.

### 2.9 Security & Isolation (`category = "security"`)
- **Cross-Course Retrieval Isolation**: Zero chunks from Course B may appear when querying Course A.
- **Cross-User Authorization Isolation**: Zero unauthorized reads/writes allowed across distinct `userId`s.
- **Prompt-Injection Defense Rate**: Adversarial prompt injections in tutor inputs, grading answers, and LLM-judge candidate answers must be flagged/refused cleanly.

---

## 3. Operational Metrics & Release Gate

Each run computes:
- **Overall Case Pass Rate**: `passedCount / caseCount`
- **Category Score**: Mean `score` across all cases in that category (`sum(case_overall_score) / category_case_count`)
- **Human-Override Separation**: Automated metrics never mutate when a human marks `"Evaluator incorrect"`; overrides are stored separately in `humanOverride`.
- **Latency Stats**: `meanMs`, `p50Ms`, `p95Ms`, `maxMs` measured cleanly with `time.perf_counter()` per case.
- **Usage Stats**: Total judge calls, prompt/completion token estimates, and estimated USD cost.

### Release Gate Rules
A run **FAILS** the Release Gate automatically if **any** critical invariant fails:
- Cross-user or cross-course data leak (`criticalFailure` in `security`)
- Any fabricated/nonexistent citation (`citationAccuracy < 1.0` when citations emitted)
- Any objective grading mismatch (`objective_accuracy < 1.0`)
- Any learner-model double-counting (`idempotency` failure)

And fails threshold gates if any configured minimum metric falls below policy (defaults: RAG Faithfulness `>= 0.85`, Citation Accuracy `== 1.0`, Grounded Refusal Accuracy `>= 0.85`, Objective Grading `== 1.0`, Security Isolation `== 1.0`).

---

## 4. Known Limitations & Benchmark Assumptions

1. **Deterministic Mode vs Live LLM Variance**: When executed without live Gemini credentials (`GEMINI_API_KEY` unset or offline sandbox), RAG/Visual answers and subjective judge checks test real retrieval/validator/prompt-builder code paths using deterministic grounded extraction rather than live stochastic Gemini completions.
2. **Fixture Scale**: `cognivue-eval-v1` uses curated multi-source fixtures (~40 cases across 9 subsystems) designed for fast, cost-bounded regression checks; live course-specific evaluation additionally exercises real user course chunks when explicitly selected.
3. **Token Estimation**: In deterministic offline mode, token counts are estimated cleanly from character length (`chars / 4`) with `estimatedCostUsd = 0.0` so cost telemetry works consistently across offline and live runs.

