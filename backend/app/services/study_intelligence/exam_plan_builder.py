"""
Exam Preparation Plan Builder for Cognivue AI Version 10.
Generates a structured revision schedule leading up to an exam target date.
Calculates derived Exam Readiness ('early', 'developing', 'on_track', 'strong')
strictly from core concept mastery, coverage, and prerequisites, avoiding false precision or fake scores.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import math
import logging

logger = logging.getLogger(__name__)


class ExamPlanBuilder:
    """
    Builds grounded exam preparation revision plans and computes exam readiness.
    """

    def build_exam_plan(
        self,
        recommendations: List[Dict[str, Any]],
        target_date_str: str,
        daily_minutes: int = 45,
        preferred_days: Optional[List[str]] = None,
        start_date_str: Optional[str] = None,
    ) -> Dict[str, Any]:
        start_dt = datetime.fromisoformat(start_date_str) if start_date_str else datetime.now()
        target_dt = datetime.fromisoformat(target_date_str)

        days_to_exam = max(1, (target_dt.date() - start_dt.date()).days)
        preferred_days = preferred_days or ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        day_abbrevs = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

        # Sort recommendations: Core & Critical first, then prerequisites, then other topics
        def exam_sort_key(r: Dict[str, Any]) -> float:
            score = float(r.get("priorityScore", 0))
            if "CORE_CONCEPT" in r.get("reasonCodes", []):
                score += 20.0
            if "PREREQUISITE_BLOCKER" in r.get("reasonCodes", []):
                score += 15.0
            return score

        sorted_recs = sorted(recommendations, key=exam_sort_key, reverse=True)

        # Derived Exam Readiness Evaluation (Section 61 & 62)
        readiness, readiness_details = self.evaluate_exam_readiness(recommendations)

        all_items = []
        rec_idx = 0

        # Schedule across days up to the exam
        for day_offset in range(days_to_exam):
            current_dt = start_dt + timedelta(days=day_offset)
            current_date_str = current_dt.strftime("%Y-%m-%d")
            day_name = day_abbrevs[current_dt.weekday()]

            if day_name not in preferred_days:
                continue

            remaining_minutes = daily_minutes
            # Closer to exam (last 3 days): emphasize mixed practice quiz / mock exam review
            is_final_stretch = (days_to_exam - day_offset) <= 3

            while remaining_minutes >= 10 and rec_idx < len(sorted_recs):
                rec = sorted_recs[rec_idx]
                best_source = (rec.get("recommendedSourceIds") or [None])[0]

                if is_final_stretch:
                    act_type = "practice_quiz"
                    duration = min(15, remaining_minutes)
                    reason = f"Final pre-exam consolidation and recall check on {rec.get('conceptName')}"
                else:
                    if rec.get("recommendationType") == "remediate_prerequisite":
                        act_type = "concept_revision"
                        duration = min(15, remaining_minutes)
                        reason = f"Exam prep: foundational prerequisite remediation for {rec.get('conceptName')}"
                    elif rec.get("priorityBand") in ("critical", "high"):
                        act_type = "review_source"
                        duration = min(15, remaining_minutes)
                        reason = f"Exam prep: high priority review of {rec.get('conceptName')}"
                    else:
                        act_type = "concept_revision"
                        duration = min(10, remaining_minutes)
                        reason = f"Exam prep: spaced retention review of {rec.get('conceptName')}"

                all_items.append({
                    "date": current_date_str,
                    "conceptId": rec.get("conceptId"),
                    "conceptName": rec.get("conceptName"),
                    "activityType": act_type,
                    "durationMinutes": duration,
                    "priority": rec.get("priorityBand", "medium"),
                    "sourceId": best_source.get("sourceId") if best_source else None,
                    "sourceDetails": best_source,
                    "assessmentConfig": rec.get("recommendedAssessmentConfig"),
                    "reason": reason,
                    "status": "pending",
                })

                remaining_minutes -= duration
                rec_idx += 1

            if rec_idx >= len(sorted_recs):
                # Cycle back for comprehensive spaced review
                rec_idx = 0

        return {
            "title": f"Exam Prep Plan ({days_to_exam} days remaining)",
            "planType": "exam_preparation",
            "startDate": start_dt.strftime("%Y-%m-%d"),
            "endDate": target_dt.strftime("%Y-%m-%d"),
            "targetDate": target_date_str,
            "dailyMinutes": daily_minutes,
            "preferredStudyDays": preferred_days,
            "examReadiness": readiness,
            "examReadinessDetails": readiness_details,
            "items": all_items,
        }

    def evaluate_exam_readiness(
        self,
        recommendations: List[Dict[str, Any]],
    ) -> tuple[str, Dict[str, Any]]:
        """
        Computes derived Exam Readiness label without false precision:
        - early: high proportion of core concepts unassessed or weak
        - developing: core concepts being studied, some developing/weak
        - on_track: core concepts proficient, few blockers
        - strong: high overall coverage, core concepts mastered
        """
        if not recommendations:
            return "early", {"reason": "No course concepts available yet"}

        core_recs = [r for r in recommendations if "CORE_CONCEPT" in r.get("reasonCodes", [])]
        if not core_recs:
            core_recs = recommendations

        total_core = len(core_recs)
        unassessed_core = sum(1 for r in core_recs if "NOT_ASSESSED" in r.get("reasonCodes", []))
        critical_core = sum(1 for r in core_recs if r.get("priorityBand") == "critical")
        high_core = sum(1 for r in core_recs if r.get("priorityBand") == "high")
        blockers = sum(1 for r in recommendations if "PREREQUISITE_BLOCKER" in r.get("reasonCodes", []))

        assessed_ratio = (total_core - unassessed_core) / max(1, total_core)
        weak_count = critical_core + high_core

        if assessed_ratio < 0.4 or weak_count > total_core * 0.6:
            readiness = "early"
            summary = "Significant portions of the core curriculum have not yet been assessed or need foundational work."
        elif weak_count > total_core * 0.3 or blockers > 1:
            readiness = "developing"
            summary = "Core concepts are in progress with several key topics and prerequisites requiring focused remediation."
        elif weak_count > 0:
            readiness = "on_track"
            summary = "Good progress across core concepts with only a few specific topics remaining for review before the exam."
        else:
            readiness = "strong"
            summary = "High mastery across core topics with scheduled spaced reviews maintaining retention."

        details = {
            "readiness": readiness,
            "summary": summary,
            "totalCoreConcepts": total_core,
            "unassessedCoreConcepts": unassessed_core,
            "weakCoreConcepts": weak_count,
            "prerequisiteBlockers": blockers,
        }

        return readiness, details

