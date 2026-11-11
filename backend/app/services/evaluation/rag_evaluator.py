"""
RAG & Grounded Tutor Evaluator:
Evaluates end-to-end course-scoped retrieval, answer generation (live Gemini when enabled,
deterministic grounded synthesis offline), citation integrity, faithfulness, relevancy, and refusal accuracy.
"""

import time
from typing import Any, Dict, List, Optional
from app.services.evaluation.base_evaluator import (
    BaseEvaluator,
    EvalCaseResult,
    PromptInjectionHardenedJudge,
    is_refusal_response,
)
from app.services.evaluation.retrieval_evaluator import RetrievalEvaluator
from app.services.evaluation.citation_evaluator import CitationEvaluator
from app.services.rag.llm_service import LLMService


class RAGEvaluator(BaseEvaluator):
    category = "rag"

    def __init__(self, use_live_llm: bool = False):
        self.use_live_llm = use_live_llm
        self.judge = PromptInjectionHardenedJudge(use_live_llm=use_live_llm)
        self.llm_service = LLMService() if use_live_llm else None

    @staticmethod
    def _build_citation_from_chunk(chunk: Dict[str, Any]) -> Dict[str, Any]:
        cit = {
            "sourceId": chunk["sourceId"],
            "sourceChunkId": chunk["_id"],
            "sourceName": chunk.get("sourceName", "Unknown"),
            "locationType": chunk.get("locationType", "page"),
            "pageNumber": chunk.get("pageNumber"),
            "slideNumber": chunk.get("slideNumber"),
            "startTime": chunk.get("startTime"),
            "endTime": chunk.get("endTime"),
            "evidenceType": chunk.get("evidenceType", "text"),
            "sourceVisualId": chunk.get("sourceVisualId"),
            "excerpt": chunk.get("text", ""),
        }
        return {k: v for k, v in cit.items() if v is not None}

    @staticmethod
    def _synthesize_grounded_offline(question: str, top_chunks: List[Dict[str, Any]]) -> tuple:
        if not top_chunks or float(top_chunks[0].get("_score", 0.0)) < 0.25:
            return (
                "I couldn't find enough information about this in the materials uploaded for this course.",
                False,
                [],
            )
        selected = top_chunks[:2]
        answer_text = " ".join(c.get("text", "").strip() for c in selected if c.get("text"))
        citations = [RAGEvaluator._build_citation_from_chunk(c) for c in selected]
        return answer_text, True, citations

    def evaluate_cases(
        self,
        cases: List[Dict[str, Any]],
        fixtures: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
    ) -> List[EvalCaseResult]:
        all_chunks = fixtures.get("chunks", [])
        chunks_by_id = {str(c["_id"]): c for c in all_chunks}
        results: List[EvalCaseResult] = []

        for case in cases:
            t0 = time.perf_counter()
            inp = case.get("input", {})
            exp = case.get("expectedBehavior", {})
            course_id = inp.get("courseId", fixtures.get("courseId"))
            query = inp.get("query", "")
            should_refuse = bool(exp.get("shouldRefuse", False))

            # 1. Course-scoped Retrieval
            retrieved = RetrievalEvaluator.retrieve_course_chunks(query, course_id, all_chunks, top_k=5)
            expected_ids = {str(ev["chunkId"]) for ev in case.get("expectedEvidence", []) if ev.get("chunkId")}
            ret_scores = RetrievalEvaluator.score_retrieval_case(retrieved, expected_ids, should_refuse=should_refuse, k=5)

            # 2. Generate Answer (live LLM if requested & available, else grounded deterministic pipeline)
            if self.use_live_llm and self.llm_service and self.llm_service.client and retrieved:
                answer_text, is_grounded, ctx_ids = self.llm_service.generate_grounded_answer(query, retrieved[:5])
                citations = []
                if is_grounded:
                    for cid in ctx_ids:
                        try:
                            idx = int(str(cid).split("_")[1]) - 1
                            if 0 <= idx < len(retrieved[:5]):
                                citations.append(self._build_citation_from_chunk(retrieved[idx]))
                        except Exception:
                            pass
            else:
                answer_text, is_grounded, citations = self._synthesize_grounded_offline(query, retrieved)

            # 3. Video full-timeline coverage check if requested by case
            video_cov_score = 1.0
            failure_reasons: List[str] = []
            if inp.get("videoCoverageCheck"):
                vid_ok, vid_msg = RetrievalEvaluator.verify_video_timeline_coverage(
                    inp["videoCoverageCheck"], all_chunks
                )
                if not vid_ok:
                    video_cov_score = 0.0
                    failure_reasons.append(vid_msg)

            # 4. Citation Validation
            expected_src_ids = set(exp.get("expectedCitationSourceIds", []))
            cit_val = CitationEvaluator.validate_citations(
                citations, expected_src_ids, chunks_by_id, course_id, should_refuse=should_refuse
            )
            failure_reasons.extend(cit_val["invalidReasons"])

            # 5. Faithfulness & Answer Relevancy Judge
            context_texts = [c.get("text", "") for c in retrieved[:5]]
            faith_res = self.judge.score_faithfulness(query, answer_text, context_texts)
            rel_score = self.judge.score_answer_relevancy(query, answer_text, should_refuse=should_refuse)

            # 6. Refusal & Term assertions
            refused = is_refusal_response(answer_text) or (not is_grounded)
            if should_refuse:
                refusal_correct = 1.0 if refused else 0.0
                true_refusal = refusal_correct
                false_refusal = 0.0
                if not refused:
                    failure_reasons.append("Expected grounded refusal on unanswerable question, but system answered.")
            else:
                refusal_correct = 0.0 if refused else 1.0
                true_refusal = 1.0
                false_refusal = 1.0 if refused else 0.0
                if refused:
                    failure_reasons.append("False refusal on question well-supported by course evidence.")

                lower_ans = answer_text.lower()
                for term in exp.get("mustIncludeTerms", []):
                    if term.lower() not in lower_ans:
                        failure_reasons.append(f"Missing required term '{term}' in grounded answer.")

            latency_ms = (time.perf_counter() - t0) * 1000.0
            overall_case_score = round(
                (
                    faith_res["faithfulness"]
                    + rel_score
                    + ret_scores["contextPrecision"]
                    + ret_scores["contextRecall"]
                    + cit_val["citationAccuracy"]
                    + refusal_correct
                    + video_cov_score
                ) / 7.0,
                4,
            )

            passed = (
                len(failure_reasons) == 0
                and faith_res["faithfulness"] >= 0.70
                and cit_val["citationAccuracy"] == 1.0
                and refusal_correct == 1.0
                and not cit_val["criticalFabrication"]
            )

            results.append(
                EvalCaseResult(
                    case_id=case["caseId"],
                    category=self.category,
                    passed=passed,
                    critical_failure=bool(cit_val["criticalFabrication"]),
                    scores={
                        "overallScore": overall_case_score,
                        "faithfulness": faith_res["faithfulness"],
                        "answerRelevancy": rel_score,
                        "contextPrecision": ret_scores["contextPrecision"],
                        "contextRecall": ret_scores["contextRecall"],
                        "precisionAtK": ret_scores["precisionAtK"],
                        "recallAtK": ret_scores["recallAtK"],
                        "hitAt1": ret_scores["hitAt1"],
                        "hitAt3": ret_scores["hitAt3"],
                        "hitAt5": ret_scores["hitAt5"],
                        "citationAccuracy": cit_val["citationAccuracy"],
                        "citationCompleteness": cit_val["citationCompleteness"],
                        "refusalAccuracy": refusal_correct,
                        "trueRefusal": true_refusal,
                        "falseRefusal": false_refusal,
                        "videoCoverage": video_cov_score,
                    },
                    system_output={
                        "answer": answer_text,
                        "grounded": is_grounded,
                        "citations": citations,
                    },
                    failure_reasons=failure_reasons,
                    retrieved_evidence_ids=[str(c.get("_id")) for c in retrieved],
                    citation_validation=cit_val,
                    latency_ms=latency_ms,
                    usage={
                        "judgeCalls": 1,
                        "promptTokens": int(faith_res.get("promptTokens", 0)),
                        "completionTokens": int(faith_res.get("completionTokens", 0)),
                    },
                )
            )

        return results

