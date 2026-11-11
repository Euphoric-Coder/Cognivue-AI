# Cognivue AI Evaluation Report — eval_a64f0c2ce786

- **Run Type**: `full_suite`
- **Dataset Version**: `cognivue-eval-v1`
- **Evaluator Version**: `eval-v1.0`
- **Model Version**: `gemini-3.6-flash`
- **Judge Mode**: `deterministic_offline`
- **Release Gate**: **PASS** (Critical failures: 0)

## Summary
- **Total Cases**: 39
- **Passed**: 39
- **Failed**: 0
- **Overall Pass Rate**: 100.0%
- **Latency (p50 / p95 / max)**: 0.03 ms / 0.35 ms / 0.84 ms
- **Judge Calls / Est. Cost**: 6 calls / $0.000171

## Category & Subsystem Metrics
| Category | Metric | Value | Numerator / Denominator |
| :--- | :--- | :--- | :--- |
| overall | `overall_pass_rate` | 100.0% | 39 / 39 |
| rag | `rag_pass_rate` | 100.0% | 6 / 6 |
| rag | `rag.overallScore` | 100.0% | 6.0 / 6 |
| rag | `rag.faithfulness` | 100.0% | 6.0 / 6 |
| rag | `rag.answerRelevancy` | 100.0% | 6.0 / 6 |
| rag | `rag.contextPrecision` | 100.0% | 6.0 / 6 |
| rag | `rag.contextRecall` | 100.0% | 6.0 / 6 |
| rag | `rag.precisionAtK` | 55.55% | 3.3333 / 6 |
| rag | `rag.recallAtK` | 100.0% | 6.0 / 6 |
| rag | `rag.hitAt1` | 100.0% | 6.0 / 6 |
| rag | `rag.hitAt3` | 100.0% | 6.0 / 6 |
| rag | `rag.hitAt5` | 100.0% | 6.0 / 6 |
| rag | `rag.citationAccuracy` | 100.0% | 6.0 / 6 |
| rag | `rag.citationCompleteness` | 100.0% | 6.0 / 6 |
| rag | `rag.refusalAccuracy` | 100.0% | 6.0 / 6 |
| rag | `rag.trueRefusal` | 100.0% | 6.0 / 6 |
| rag | `rag.falseRefusal` | 0.0% | 0.0 / 6 |
| rag | `rag.videoCoverage` | 100.0% | 6.0 / 6 |
| multimodal | `multimodal_pass_rate` | 100.0% | 4 / 4 |
| multimodal | `multimodal.overallScore` | 100.0% | 4.0 / 4 |
| multimodal | `multimodal.visualRetrievalPrecision` | 100.0% | 4.0 / 4 |
| multimodal | `multimodal.visualSafetyAccuracy` | 100.0% | 4.0 / 4 |
| multimodal | `multimodal.videoTimestampValidity` | 100.0% | 4.0 / 4 |
| knowledge_graph | `knowledge_graph_pass_rate` | 100.0% | 3 / 3 |
| knowledge_graph | `knowledge_graph.overallScore` | 100.0% | 3.0 / 3 |
| knowledge_graph | `knowledge_graph.conceptPrecision` | 100.0% | 1.0 / 1 |
| knowledge_graph | `knowledge_graph.conceptRecall` | 100.0% | 1.0 / 1 |
| knowledge_graph | `knowledge_graph.relationshipPrecision` | 100.0% | 1.0 / 1 |
| knowledge_graph | `knowledge_graph.relationshipRecall` | 100.0% | 1.0 / 1 |
| knowledge_graph | `knowledge_graph.evidenceTraceability` | 100.0% | 2.0 / 2 |
| knowledge_graph | `knowledge_graph.duplicateDetectionRate` | 100.0% | 1.0 / 1 |
| knowledge_graph | `knowledge_graph.cycleResolutionRate` | 100.0% | 1.0 / 1 |
| assessment | `assessment_pass_rate` | 100.0% | 4 / 4 |
| assessment | `assessment.overallScore` | 98.44% | 3.9375 / 4 |
| assessment | `assessment.questionValidityRate` | 100.0% | 1.0 / 1 |
| assessment | `assessment.questionTypeCoverage` | 100.0% | 1.0 / 1 |
| assessment | `assessment.meanQualityScore` | 81.25% | 0.8125 / 1 |
| assessment | `assessment.ambiguityRejectionRate` | 100.0% | 1.0 / 1 |
| assessment | `assessment.duplicateDetectionRate` | 100.0% | 1.0 / 1 |
| assessment | `assessment.insufficientEvidenceRefusal` | 100.0% | 1.0 / 1 |
| grading | `grading_pass_rate` | 100.0% | 6 / 6 |
| grading | `grading.overallScore` | 100.0% | 6.0 / 6 |
| grading | `grading.objectiveAccuracy` | 100.0% | 3.0 / 3 |
| grading | `grading.subjectiveMae` | 0.0 | 0.0 / 2 |
| grading | `grading.subjectiveAgreement` | 100.0% | 2.0 / 2 |
| grading | `grading.subjectiveBandAgreement` | 100.0% | 2.0 / 2 |
| grading | `grading.gradingInjectionDefense` | 100.0% | 1.0 / 1 |
| learner_model | `learner_model_pass_rate` | 100.0% | 4 / 4 |
| learner_model | `learner_model.overallScore` | 100.0% | 4.0 / 4 |
| learner_model | `learner_model.monotonicityPass` | 100.0% | 1.0 / 1 |
| learner_model | `learner_model.idempotencyPass` | 100.0% | 1.0 / 1 |
| learner_model | `learner_model.confidenceCalibrationPass` | 100.0% | 1.0 / 1 |
| learner_model | `learner_model.recencyStabilityPass` | 100.0% | 1.0 / 1 |
| adaptive_tutor | `adaptive_tutor_pass_rate` | 100.0% | 4 / 4 |
| adaptive_tutor | `adaptive_tutor.overallScore` | 100.0% | 4.0 / 4 |
| adaptive_tutor | `adaptive_tutor.strategyAdaptationAccuracy` | 100.0% | 1.0 / 1 |
| adaptive_tutor | `adaptive_tutor.factGroundingConsistency` | 100.0% | 1.0 / 1 |
| adaptive_tutor | `adaptive_tutor.socraticEscapePass` | 100.0% | 1.0 / 1 |
| adaptive_tutor | `adaptive_tutor.hintEscalationPass` | 100.0% | 1.0 / 1 |
| adaptive_tutor | `adaptive_tutor.misconceptionInterventionPass` | 100.0% | 1.0 / 1 |
| study_intelligence | `study_intelligence_pass_rate` | 100.0% | 4 / 4 |
| study_intelligence | `study_intelligence.overallScore` | 100.0% | 4.0 / 4 |
| study_intelligence | `study_intelligence.studyLogicConsistency` | 100.0% | 1.0 / 1 |
| study_intelligence | `study_intelligence.explainabilityRate` | 100.0% | 1.0 / 1 |
| study_intelligence | `study_intelligence.unassessedSemanticsPass` | 100.0% | 1.0 / 1 |
| study_intelligence | `study_intelligence.spacedBudgetPass` | 100.0% | 1.0 / 1 |
| study_intelligence | `study_intelligence.closedLoopReprioritization` | 100.0% | 1.0 / 1 |
| security | `security_pass_rate` | 100.0% | 4 / 4 |
| security | `security.overallScore` | 100.0% | 4.0 / 4 |
| security | `security.isolationPass` | 100.0% | 1.0 / 1 |
| security | `security.userIsolationPass` | 100.0% | 1.0 / 1 |
| security | `security.judgeInjectionDefense` | 100.0% | 1.0 / 1 |
| security | `security.tutorInjectionDefense` | 100.0% | 1.0 / 1 |
| rag | `rag_faithfulness` | 100.0% | 6.0 / 6 |
| rag | `rag_context_relevance` | 100.0% | 6.0 / 6 |
| rag | `citation_accuracy` | 100.0% | 6.0 / 6 |
| rag | `grounded_refusal_accuracy` | 100.0% | 6.0 / 6 |
| grading | `objective_grading_accuracy` | 100.0% | 3.0 / 3 |

## Failed Cases (0)
- None. All evaluated cases passed.
