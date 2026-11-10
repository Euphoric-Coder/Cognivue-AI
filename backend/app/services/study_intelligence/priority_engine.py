"""
Deterministic Study Priority Engine for Cognivue AI Version 10.
Calculates priority scores (0-100), priority bands, and explainable reason codes
based on real learner evidence, course graph, misconceptions, and review state.
"""

from typing import Dict, Any, List, Optional
import math
import time
import logging

logger = logging.getLogger(__name__)

# Base review intervals in days
BASE_REVIEW_INTERVALS = {
    "needs_attention": 1,
    "developing": 3,
    "proficient": 7,
    "strong": 14,
    "insufficient_evidence": 1,
}


class PriorityEngine:
    """
    Transparent, deterministic study priority engine.
    Ensures:
    - Mastered concepts receive low priority unless Due for Review.
    - Unassessed concepts are labeled 'Not Assessed', NOT 'Weak'.
    - Prerequisite blockers are recognized and prioritized.
    - Active misconceptions boost priority with targeted remediation reasons.
    - Recommendations are explainable with exact evidence data.
    """

    def calculate_priority(
        self,
        concept: Dict[str, Any],
        learner_state: Optional[Dict[str, Any]] = None,
        active_misconceptions: Optional[List[Dict[str, Any]]] = None,
        is_prereq_for_weak: bool = False,
        review_state: Optional[Dict[str, Any]] = None,
        exam_target_date: Optional[str] = None,
        now_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        if now_ms is None:
            now_ms = int(time.time() * 1000)

        active_misconceptions = active_misconceptions or []
        reason_codes: List[str] = []
        reason_details: Dict[str, Any] = {}
        score: float = 0.0

        is_core = concept.get("importance") == "core"
        is_supporting = concept.get("importance") == "supporting"

        # 1. Concept Importance (up to 10 pts)
        if is_core:
            score += 10.0
            reason_codes.append("CORE_CONCEPT")
            reason_details["isCore"] = True
        elif is_supporting:
            score += 5.0
            reason_details["isSupporting"] = True

        # 2. Learner Mastery State
        evidence_count = int(learner_state.get("evidenceCount", 0)) if learner_state else 0
        mastery_band = learner_state.get("masteryBand", "insufficient_evidence") if learner_state else "insufficient_evidence"
        mastery_prob = learner_state.get("masteryProbability") if learner_state else None
        confidence = learner_state.get("confidence", "insufficient") if learner_state else "insufficient"

        if evidence_count == 0 or mastery_band == "insufficient_evidence":
            # Section 8: Unassessed concepts labeled 'Not Assessed', NEVER 'Weak'
            score += 25.0 if is_core else 15.0
            reason_codes.append("NOT_ASSESSED")
            reason_details["isUnassessed"] = True
            reason_details["masteryBand"] = "not_assessed"
        elif mastery_band == "needs_attention":
            score += 40.0
            reason_codes.append("LOW_MASTERY")
            reason_details["mastery"] = round(mastery_prob * 100) if mastery_prob is not None else 0
            reason_details["masteryBand"] = "needs_attention"
        elif mastery_band == "developing":
            score += 25.0
            reason_codes.append("DEVELOPING_MASTERY")
            reason_details["mastery"] = round(mastery_prob * 100) if mastery_prob is not None else 50
            reason_details["masteryBand"] = "developing"
        elif mastery_band == "proficient":
            score += 10.0
            reason_details["mastery"] = round(mastery_prob * 100) if mastery_prob is not None else 75
            reason_details["masteryBand"] = "proficient"
        elif mastery_band == "strong":
            # Mastered: low baseline priority
            score += 0.0
            reason_details["mastery"] = round(mastery_prob * 100) if mastery_prob is not None else 95
            reason_details["masteryBand"] = "strong"

        # 3. Confidence Adjustment
        if confidence == "high" and mastery_band in ("needs_attention", "developing"):
            score += 10.0
            reason_codes.append("CONFIRMED_DEFICIENCY")
            reason_details["confidence"] = "high"
        elif confidence == "low" and evidence_count > 0:
            score += 3.0
            reason_details["confidence"] = "low"

        # 4. Recent Errors (up to 15 pts)
        incorrect_attempts = int(learner_state.get("incorrectAttempts", 0)) if learner_state else 0
        partial_attempts = int(learner_state.get("partialAttempts", 0)) if learner_state else 0
        recent_errors = incorrect_attempts + partial_attempts

        if recent_errors >= 2:
            score += 15.0
            reason_codes.append("RECENT_ERRORS")
            reason_details["recentErrors"] = recent_errors
        elif recent_errors == 1:
            score += 8.0
            reason_codes.append("RECENT_ERRORS")
            reason_details["recentErrors"] = 1

        # 5. Prerequisite Blocker (20 pts)
        if is_prereq_for_weak:
            score += 20.0
            reason_codes.append("PREREQUISITE_BLOCKER")
            reason_details["isPrerequisiteBlocker"] = True

        # 6. Active Misconceptions (up to 15 pts)
        c_id = str(concept.get("_id", ""))
        c_name = concept.get("name", "")
        concept_misconceptions = [
            m for m in active_misconceptions
            if str(m.get("conceptId", "")) == c_id or m.get("conceptName") == c_name
        ]

        if concept_misconceptions:
            has_high_conf = any(m.get("confidence") == "high" for m in concept_misconceptions)
            score += 15.0 if has_high_conf else 10.0
            reason_codes.append("ACTIVE_MISCONCEPTION")
            reason_details["misconceptionCount"] = len(concept_misconceptions)
            reason_details["misconceptionKey"] = concept_misconceptions[0].get("misconceptionKey")
            reason_details["misconceptionDesc"] = concept_misconceptions[0].get("description")

        # 7. Spaced Review Due-ness (Section 7 & 23)
        is_due_for_review = False
        if review_state and review_state.get("nextReviewAt"):
            next_review_ms = int(review_state["nextReviewAt"])
            diff_ms = now_ms - next_review_ms
            diff_days = math.floor(diff_ms / (24 * 60 * 60 * 1000))
            if diff_days >= 3:
                score += 20.0
                is_due_for_review = True
                reason_codes.append("DUE_FOR_REVIEW")
                reason_details["daysOverdue"] = diff_days
            elif diff_days >= 0:
                score += 15.0
                is_due_for_review = True
                reason_codes.append("DUE_FOR_REVIEW")
                reason_details["daysOverdue"] = diff_days
            elif diff_days >= -2:
                score += 5.0
        elif evidence_count > 0 and learner_state and learner_state.get("lastObservedAt"):
            last_obs_ms = int(learner_state["lastObservedAt"])
            diff_days = math.floor((now_ms - last_obs_ms) / (24 * 60 * 60 * 1000))
            threshold = BASE_REVIEW_INTERVALS.get(mastery_band, 7)
            if diff_days >= threshold:
                score += 15.0
                is_due_for_review = True
                reason_codes.append("DUE_FOR_REVIEW")
                reason_details["daysSinceObserved"] = diff_days

        # 8. Exam Target Relevance
        if exam_target_date:
            try:
                from datetime import datetime
                target_dt = datetime.fromisoformat(exam_target_date.replace("Z", "+00:00"))
                target_ms = int(target_dt.timestamp() * 1000)
                if target_ms > now_ms:
                    days_to_exam = max(1, math.ceil((target_ms - now_ms) / (24 * 60 * 60 * 1000)))
                    if is_core and (mastery_band in ("needs_attention", "developing") or evidence_count == 0):
                        exam_boost = min(15.0, math.ceil(30.0 / days_to_exam) * 5.0)
                        score += exam_boost
                        reason_codes.append("EXAM_PRIORITY")
                        reason_details["daysToExam"] = days_to_exam
            except Exception:
                pass

        # Clamp priority score to [0, 100]
        priority_score = min(100.0, max(0.0, round(score, 1)))

        # Priority Band mapping
        if priority_score >= 75.0:
            priority_band = "critical"
        elif priority_score >= 50.0:
            priority_band = "high"
        elif priority_score >= 25.0:
            priority_band = "medium"
        else:
            priority_band = "low"

        # Recommendation Type mapping
        if is_prereq_for_weak:
            recommendation_type = "remediate_prerequisite"
        elif concept_misconceptions:
            recommendation_type = "address_misconception"
        elif is_due_for_review:
            recommendation_type = "spaced_review"
        elif mastery_band in ("needs_attention", "developing"):
            recommendation_type = "practice" if evidence_count >= 2 else "review"
        elif evidence_count == 0:
            recommendation_type = "learn"
        else:
            recommendation_type = "review"

        # Human-readable reason summary
        summary_parts: List[str] = []
        if evidence_count == 0:
            summary_parts.append("Core concept not yet assessed")
        elif mastery_prob is not None:
            pct = round(mastery_prob * 100)
            band_label = mastery_band.replace("_", " ")
            summary_parts.append(f"Mastery at {pct}% ({band_label})")

        if is_prereq_for_weak:
            summary_parts.append("Prerequisite blocking progress on dependent concepts")
        if concept_misconceptions:
            desc = concept_misconceptions[0].get("description") or concept_misconceptions[0].get("misconceptionKey")
            summary_parts.append(f"Active misconception: {desc}")
        if recent_errors > 0:
            summary_parts.append(f"{recent_errors} recent error{'s' if recent_errors > 1 else ''}")
        if is_due_for_review:
            summary_parts.append("Due for scheduled spaced review")

        if not summary_parts:
            summary_parts.append("Regular curriculum progression")

        reason_summary = " • ".join(summary_parts)

        return {
            "priorityScore": priority_score,
            "priorityBand": priority_band,
            "recommendationType": recommendation_type,
            "reasonCodes": reason_codes,
            "reasonSummary": reason_summary,
            "reasonDetails": reason_details,
            "diagnostics": {
                "baseImportanceScore": 10 if is_core else (5 if is_supporting else 0),
                "masteryScore": 40 if mastery_band == "needs_attention" else (25 if mastery_band == "developing" else (10 if mastery_band == "proficient" else (15 if evidence_count == 0 else 0))),
                "confidenceScore": 10 if (confidence == "high" and mastery_band in ("needs_attention", "developing")) else (3 if confidence == "low" else 0),
                "recentErrorsScore": 15 if recent_errors >= 2 else (8 if recent_errors == 1 else 0),
                "prerequisiteScore": 20 if is_prereq_for_weak else 0,
                "misconceptionScore": (15 if any(m.get("confidence") == "high" for m in concept_misconceptions) else 10) if concept_misconceptions else 0,
                "spacedReviewScore": 20 if (reason_details.get("daysOverdue", 0) >= 3) else (15 if is_due_for_review else 0),
                "rawScore": score,
                "finalScore": priority_score,
            }
        }

