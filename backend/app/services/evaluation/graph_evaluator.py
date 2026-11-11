"""
Knowledge Graph Quality Evaluator:
Executes Cognivue's real ConceptNormalizer and GraphValidator against benchmark fixtures
and measures concept/relationship precision & recall, duplicate merge accuracy,
100% evidence traceability, and prerequisite cycle removal.
"""

import time
from typing import Any, Dict, List, Optional, Set, Tuple
from app.services.evaluation.base_evaluator import BaseEvaluator, EvalCaseResult
from app.services.knowledge_graph.concept_normalizer import ConceptNormalizer
from app.services.knowledge_graph.graph_validator import GraphValidator


class GraphEvaluator(BaseEvaluator):
    category = "knowledge_graph"

    def evaluate_cases(
        self,
        cases: List[Dict[str, Any]],
        fixtures: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
    ) -> List[EvalCaseResult]:
        results: List[EvalCaseResult] = []

        for case in cases:
            t0 = time.perf_counter()
            inp = case.get("input", {})
            exp = case.get("expectedBehavior", {})
            scenario = inp.get("scenarioType") or case.get("metadata", {}).get("scenarioType")
            failure_reasons: List[str] = []
            scores: Dict[str, float] = {}
            sys_out: Dict[str, Any] = {}

            if scenario == "duplicate_alias_merge":
                raw = [
                    {
                        "name": c["name"],
                        "aliases": c.get("aliases", []),
                        "importance": c.get("importance", "supporting"),
                        "evidence": [{"chunkId": eid} for eid in c.get("evidenceIds", [])],
                    }
                    for c in inp.get("rawConcepts", [])
                ]
                merged = ConceptNormalizer.merge_concepts(raw)
                expected_count = int(exp.get("expectedMergedCount", len(merged)))
                merged_ok = len(merged) == expected_count
                if not merged_ok:
                    failure_reasons.append(f"Expected {expected_count} merged concepts, got {len(merged)}.")
                scores = {
                    "overallScore": 1.0 if merged_ok else 0.0,
                    "duplicateDetectionRate": 1.0 if merged_ok else 0.0,
                }
                sys_out = {"mergedCount": len(merged), "canonicalNames": [m["name"] for m in merged]}

            else:
                # Gold graph or cycle/traceability test using GraphValidator
                concepts = [
                    {
                        "tempId": c["_id"],
                        "name": c["name"],
                        "importance": c.get("importance", "supporting"),
                        "evidence": c.get("evidenceIds", []),
                    }
                    for c in inp.get("concepts", [])
                ]
                evidence = [
                    {"conceptTempId": c["_id"], "chunkId": eid}
                    for c in inp.get("concepts", [])
                    for eid in c.get("evidenceIds", [])
                ]
                relationships = [
                    {
                        "fromTempId": r["fromConceptId"],
                        "toTempId": r["toConceptId"],
                        "relationType": r["relationType"],
                        "evidenceIds": r.get("evidenceIds", []),
                    }
                    for r in inp.get("relationships", [])
                ]

                val_concepts, val_rels, _, warnings = GraphValidator.validate_and_sanitize(
                    concepts, relationships, evidence
                )
                val_ids = {c["tempId"]: c["name"] for c in val_concepts}

                # Check 100% traceability on surviving concepts
                untraced = [c["tempId"] for c in val_concepts if not c.get("evidence")]
                traceability = 1.0 if not untraced else 0.0
                if untraced:
                    failure_reasons.append(f"Untraced concepts survived validation: {untraced}")

                if scenario == "gold_graph_precision_recall":
                    pred_names = {ConceptNormalizer.normalize_name(c["name"]) for c in val_concepts}
                    gold_names = {ConceptNormalizer.normalize_name(n) for n in exp.get("expectedConceptNames", [])}
                    c_prec = len(pred_names & gold_names) / max(1, len(pred_names))
                    c_rec = len(pred_names & gold_names) / max(1, len(gold_names))

                    pred_edges: Set[Tuple[str, str, str]] = {
                        (
                            ConceptNormalizer.normalize_name(val_ids[r["fromTempId"]]),
                            ConceptNormalizer.normalize_name(val_ids[r["toTempId"]]),
                            r["relationType"],
                        )
                        for r in val_rels
                    }
                    gold_edges = {
                        (ConceptNormalizer.normalize_name(e[0]), ConceptNormalizer.normalize_name(e[1]), e[2])
                        for e in exp.get("expectedEdges", [])
                    }
                    r_prec = len(pred_edges & gold_edges) / max(1, len(pred_edges))
                    r_rec = len(pred_edges & gold_edges) / max(1, len(gold_edges))

                    if c_prec < 0.8 or c_rec < 0.8:
                        failure_reasons.append(f"Concept precision/recall below threshold: P={c_prec}, R={c_rec}")

                    overall = round((c_prec + c_rec + r_prec + r_rec + traceability) / 5.0, 4)
                    scores = {
                        "overallScore": overall,
                        "conceptPrecision": round(c_prec, 4),
                        "conceptRecall": round(c_rec, 4),
                        "relationshipPrecision": round(r_prec, 4),
                        "relationshipRecall": round(r_rec, 4),
                        "evidenceTraceability": traceability,
                    }
                else:
                    # Cycle & traceability enforcement
                    removed_bad = exp.get("shouldRemoveUngroundedConcept") not in val_ids
                    still_cyclic_prereqs = [r for r in val_rels if r["relationType"] == "PREREQUISITE_OF"]
                    # With 2 nodes in cycle, breaking cycle downgrades one edge to RELATED_TO leaving at most 1 PREREQUISITE_OF edge
                    cycle_broken = len(still_cyclic_prereqs) <= 1 and any("CYCLE" in w for w in warnings)
                    if not removed_bad:
                        failure_reasons.append("Ungrounded concept was not pruned by GraphValidator.")
                    if not cycle_broken:
                        failure_reasons.append("Prerequisite cycle was not resolved by GraphValidator.")

                    overall = 1.0 if (removed_bad and cycle_broken and traceability == 1.0) else 0.0
                    scores = {
                        "overallScore": overall,
                        "evidenceTraceability": traceability,
                        "cycleResolutionRate": 1.0 if cycle_broken else 0.0,
                    }

                sys_out = {
                    "survivingConcepts": [c["name"] for c in val_concepts],
                    "survivingRelationships": val_rels,
                    "warnings": warnings,
                }

            latency_ms = (time.perf_counter() - t0) * 1000.0
            passed = len(failure_reasons) == 0 and scores.get("overallScore", 0.0) >= 0.85
            results.append(
                EvalCaseResult(
                    case_id=case["caseId"],
                    category=self.category,
                    passed=passed,
                    scores=scores,
                    system_output=sys_out,
                    failure_reasons=failure_reasons,
                    latency_ms=latency_ms,
                )
            )

        return results
