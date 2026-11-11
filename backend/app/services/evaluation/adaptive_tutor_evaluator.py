"""
Adaptive Tutoring Correctness Evaluator:
Tests Cognivue's real PedagogyEngine, MisconceptionService, and AdaptivePromptBuilder for:
- Mastery-driven explanation depth, language complexity & scaffolding adaptation
- Fact consistency / grounding immutability across learner states
- Socratic escape detection
- Progressive Hint levels (1 -> 2 -> 3 -> 4)
- Misconception-targeted intervention
"""

import time
from typing import Any, Dict, List, Optional
from app.services.evaluation.base_evaluator import BaseEvaluator, EvalCaseResult
from app.services.adaptive_tutor.learner_context_service import AdaptiveTutorContext
from app.services.adaptive_tutor.pedagogy_engine import PedagogyEngine
from app.services.adaptive_tutor.adaptive_prompt_builder import AdaptivePromptBuilder
from app.services.adaptive_tutor.misconception_service import MisconceptionService


class AdaptiveTutorEvaluator(BaseEvaluator):
    category = "adaptive_tutor"

    def __init__(self):
        self.pedagogy_engine = PedagogyEngine()
        self.prompt_builder = AdaptivePromptBuilder()
        self.misconception_service = MisconceptionService()

    @staticmethod
    def _build_context(raw: Dict[str, Any]) -> AdaptiveTutorContext:
        weak_prereqs = []
        if raw.get("hasWeakPrerequisite"):
            weak_prereqs.append({
                "conceptId": "prereq_eval",
                "conceptName": raw.get("weakPrerequisiteName", "Prerequisite"),
                "masteryBand": "developing",
            })
        return AdaptiveTutorContext(
            concept_id=raw.get("conceptId"),
            concept_name=raw.get("conceptName"),
            mastery_probability=raw.get("masteryProbability"),
            mastery_band=raw.get("masteryBand", "not_assessed"),
            confidence=raw.get("confidence", "low"),
            evidence_count=int(raw.get("evidenceCount", 0)),
            is_unassessed=int(raw.get("evidenceCount", 0)) == 0,
            prerequisite_readiness="weak" if weak_prereqs else "ready",
            weak_prerequisites=weak_prereqs,
            active_misconceptions=raw.get("activeMisconceptions", []),
        )

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
            scenario = inp.get("scenarioType")
            failure_reasons: List[str] = []
            scores: Dict[str, float] = {}
            sys_out: Dict[str, Any] = {}

            if scenario == "mastery_depth_adaptation_and_fact_consistency":
                weak_ctx = self._build_context(inp["weakStudentContext"])
                strong_ctx = self._build_context(inp["strongStudentContext"])
                weak_strat = self.pedagogy_engine.determine_strategy(weak_ctx, inp["tutorMode"], inp["query"])
                strong_strat = self.pedagogy_engine.determine_strategy(strong_ctx, inp["tutorMode"], inp["query"])

                weak_prompt = self.prompt_builder.build_system_instruction(weak_strat, weak_ctx)
                strong_prompt = self.prompt_builder.build_system_instruction(strong_strat, strong_ctx)

                adapt_ok = (
                    weak_strat.explanation_depth == exp["weakExplanationDepth"]
                    and weak_strat.language_complexity == exp["weakLanguageComplexity"]
                    and weak_strat.scaffolding_level == exp["weakScaffoldingLevel"]
                    and weak_strat.include_prerequisite_review == exp["weakRequiresPrereqBridge"]
                    and strong_strat.explanation_depth == exp["strongExplanationDepth"]
                    and strong_strat.language_complexity == exp["strongLanguageComplexity"]
                    and strong_strat.scaffolding_level == exp["strongScaffoldingLevel"]
                )
                grounding_invariant = (
                    "CORE GROUNDING MANDATE:" in weak_prompt
                    and "CORE GROUNDING MANDATE:" in strong_prompt
                    and "NEVER invent examples" in weak_prompt
                    and "NEVER invent examples" in strong_prompt
                )
                if not adapt_ok:
                    failure_reasons.append(
                        f"Adaptation mismatch: weak=({weak_strat.explanation_depth}/{weak_strat.language_complexity}/{weak_strat.scaffolding_level}), strong=({strong_strat.explanation_depth}/{strong_strat.language_complexity}/{strong_strat.scaffolding_level})."
                    )
                if not grounding_invariant:
                    failure_reasons.append("Core factual grounding mandate missing across adaptive prompts.")

                scores = {
                    "overallScore": 1.0 if (adapt_ok and grounding_invariant) else 0.0,
                    "strategyAdaptationAccuracy": 1.0 if adapt_ok else 0.0,
                    "factGroundingConsistency": 1.0 if grounding_invariant else 0.0,
                }
                sys_out = {
                    "weakStrategy": weak_strat.__dict__,
                    "strongStrategy": strong_strat.__dict__,
                }

            elif scenario == "socratic_escape":
                ctx = self._build_context(inp["context"])
                strat = self.pedagogy_engine.determine_strategy(ctx, inp["tutorMode"], inp["query"])
                ok = (not strat.socratic_guiding) and (not strat.ask_check_question)
                if not ok:
                    failure_reasons.append("Socratic escape phrase failed to disable socratic_guiding / check_question.")
                scores = {"overallScore": 1.0 if ok else 0.0, "socraticEscapePass": 1.0 if ok else 0.0}
                sys_out = strat.__dict__

            elif scenario == "hint_progression_1_to_4":
                ctx = self._build_context(inp["context"])
                levels = inp.get("levels", [1, 2, 3, 4])
                prompts_by_lvl = {}
                detected_lvls = []
                for lvl in levels:
                    strat = self.pedagogy_engine.determine_strategy(ctx, "hint", inp["query"], active_hint_level=lvl)
                    detected_lvls.append(strat.hint_level)
                    prompts_by_lvl[lvl] = self.prompt_builder.build_system_instruction(strat, ctx)

                distinct_instructions = len(set(prompts_by_lvl.values())) == len(levels)
                ordered = detected_lvls == levels
                ok = ordered and distinct_instructions
                if not ok:
                    failure_reasons.append(f"Hint progression invalid: levels={detected_lvls}, distinctPrompts={distinct_instructions}.")
                scores = {"overallScore": 1.0 if ok else 0.0, "hintEscalationPass": 1.0 if ok else 0.0}
                sys_out = {"detectedLevels": detected_lvls, "distinctPrompts": distinct_instructions}

            elif scenario == "misconception_intervention":
                ctx = self._build_context(inp["context"])
                strat = self.pedagogy_engine.determine_strategy(ctx, inp["tutorMode"], inp["query"])
                mis_guidance = self.misconception_service.format_misconception_guidance(ctx.active_misconceptions)
                body = self.prompt_builder.build_prompt_body(
                    question=inp["query"],
                    contexts=[],
                    context=ctx,
                    strategy=strat,
                    misconception_guidance=mis_guidance,
                )
                ok = (
                    bool(mis_guidance)
                    and "ACTIVE LEARNER MISCONCEPTION DETECTED" in body
                    and "Omitting inner derivative" in body
                )
                if not ok:
                    failure_reasons.append("Active misconception guidance failed to inject neutral clarification block.")
                scores = {"overallScore": 1.0 if ok else 0.0, "misconceptionInterventionPass": 1.0 if ok else 0.0}
                sys_out = {"misconceptionGuidance": mis_guidance, "strategy": strat.__dict__}

            latency_ms = (time.perf_counter() - t0) * 1000.0
            results.append(
                EvalCaseResult(
                    case_id=case["caseId"],
                    category=self.category,
                    passed=len(failure_reasons) == 0,
                    scores=scores,
                    system_output=sys_out,
                    failure_reasons=failure_reasons,
                    latency_ms=latency_ms,
                )
            )

        return results
