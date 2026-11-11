"""
Multimodal & Visual RAG Evaluator:
Evaluates visual retrieval precision, chart trend vs exact value safety,
table accuracy, video keyframe click-to-seek timestamp validation, and missing-visual refusal.
"""

import time
from typing import Any, Dict, List, Optional
from app.services.evaluation.base_evaluator import BaseEvaluator, EvalCaseResult, is_refusal_response
from app.services.evaluation.retrieval_evaluator import RetrievalEvaluator


class MultimodalEvaluator(BaseEvaluator):
    category = "multimodal"

    def evaluate_cases(
        self,
        cases: List[Dict[str, Any]],
        fixtures: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
    ) -> List[EvalCaseResult]:
        all_chunks = fixtures.get("chunks", [])
        results: List[EvalCaseResult] = []

        for case in cases:
            t0 = time.perf_counter()
            inp = case.get("input", {})
            exp = case.get("expectedBehavior", {})
            course_id = inp.get("courseId", fixtures.get("courseId"))
            query = inp.get("query", "")
            vtype = inp.get("visualType")
            should_refuse = bool(exp.get("shouldRefuse", False))

            # Filter only visual chunks matching course for multimodal retrieval
            visual_chunks = [c for c in all_chunks if c.get("evidenceType") == "visual"]
            retrieved = RetrievalEvaluator.retrieve_course_chunks(
                query, course_id, visual_chunks, top_k=3, min_score=0.16, visual_type_filter=vtype
            )

            expected_vis_ids = set(exp.get("expectedVisualIds", []))
            retrieved_vis_ids = [str(c.get("sourceVisualId")) for c in retrieved if c.get("sourceVisualId")]
            failure_reasons: List[str] = []

            if should_refuse:
                refused = len(retrieved) == 0 or float(retrieved[0].get("_score", 0.0)) < 0.25
                vis_precision = 1.0 if refused else 0.0
                answer_text = (
                    "No matching visual asset was found in the uploaded course slides or keyframes."
                    if refused
                    else f"Found visual: {retrieved[0].get('sectionTitle')}"
                )
                if not refused:
                    failure_reasons.append("Retrieved irrelevant visual on missing-visual negative test.")
                safety_score = 1.0 if is_refusal_response(answer_text) or refused else 0.0
                timestamp_ok = 1.0
            else:
                hits = sum(1 for vid in retrieved_vis_ids if vid in expected_vis_ids)
                vis_precision = hits / max(1, len(retrieved_vis_ids)) if retrieved_vis_ids else 0.0
                if not expected_vis_ids.intersection(retrieved_vis_ids):
                    failure_reasons.append(f"Expected visual {sorted(expected_vis_ids)} not retrieved (got {retrieved_vis_ids}).")

                top = retrieved[0] if retrieved else {}
                answer_text = top.get("text", "")
                lower_ans = answer_text.lower()

                for term in exp.get("mustIncludeTerms", []):
                    if term.lower() not in lower_ans:
                        failure_reasons.append(f"Missing visual understanding term '{term}'.")

                # Chart value hallucination check
                safety_score = 1.0
                missing_target = exp.get("mustNotFabricateExactDecimalFor")
                if missing_target and "not labeled" not in lower_ans and "unlabeled" not in lower_ans:
                    safety_score = 0.0
                    failure_reasons.append(f"Failed chart unlabelled-value safeguard for '{missing_target}'.")

                # Video keyframe timestamp validation
                timestamp_ok = 1.0
                ts_bounds = exp.get("expectedTimestampBounds")
                if ts_bounds and top:
                    st = top.get("startTime")
                    en = top.get("endTime")
                    dur = top.get("videoDuration")
                    if st is None or en is None or dur is None or not (0 <= st < en <= dur):
                        timestamp_ok = 0.0
                        failure_reasons.append(f"Invalid video keyframe click-to-seek timestamp: {st}-{en}/{dur}")

            latency_ms = (time.perf_counter() - t0) * 1000.0
            overall = round((vis_precision + safety_score + timestamp_ok) / 3.0, 4)
            passed = len(failure_reasons) == 0 and overall >= 0.80

            results.append(
                EvalCaseResult(
                    case_id=case["caseId"],
                    category=self.category,
                    passed=passed,
                    scores={
                        "overallScore": overall,
                        "visualRetrievalPrecision": round(vis_precision, 4),
                        "visualSafetyAccuracy": safety_score,
                        "videoTimestampValidity": timestamp_ok,
                    },
                    system_output={
                        "answer": answer_text,
                        "retrievedVisualIds": retrieved_vis_ids,
                    },
                    failure_reasons=failure_reasons,
                    retrieved_evidence_ids=[str(c.get("_id")) for c in retrieved],
                    latency_ms=latency_ms,
                )
            )

        return results

