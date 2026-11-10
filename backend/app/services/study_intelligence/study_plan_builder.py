"""
Study Plan Builder for Cognivue AI Version 10.
Generates Daily and Weekly study plans fitting available time budgets (15-120 min),
distributes activities across preferred study days, and handles rebalancing without duplicates.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Standard Activity Durations in Minutes (Section 34)
ACTIVITY_DURATIONS = {
    "review_source": 10,
    "watch_video": 10,
    "review_visual": 8,
    "practice_quiz": 12,
    "mock_exam": 25,
    "tutor_review": 10,
    "concept_revision": 10,
}


class StudyPlanBuilder:
    """
    Constructs structured daily and weekly study schedules.
    """

    def build_daily_plan(
        self,
        recommendations: List[Dict[str, Any]],
        daily_minutes: int = 30,
        today_date_str: Optional[str] = None,
    ) -> Dict[str, Any]:
        today_date_str = today_date_str or datetime.now().strftime("%Y-%m-%d")

        # Sort recommendations descending by priorityScore
        sorted_recs = sorted(recommendations, key=lambda r: float(r.get("priorityScore", 0)), reverse=True)

        plan_items = []
        remaining_minutes = max(15, daily_minutes)

        for rec in sorted_recs:
            if remaining_minutes < 5:
                break

            act_type, duration = self._select_activity_for_recommendation(rec, remaining_minutes)
            if duration <= 0 or duration > remaining_minutes:
                continue

            best_source = (rec.get("recommendedSourceIds") or [None])[0]

            plan_items.append({
                "date": today_date_str,
                "conceptId": rec.get("conceptId"),
                "conceptName": rec.get("conceptName"),
                "activityType": act_type,
                "durationMinutes": duration,
                "priority": rec.get("priorityBand", "medium"),
                "sourceId": best_source.get("sourceId") if best_source else None,
                "sourceDetails": best_source,
                "assessmentConfig": rec.get("recommendedAssessmentConfig"),
                "reason": rec.get("reasonSummary", "High study priority"),
                "status": "pending",
            })

            remaining_minutes -= duration

        total_scheduled = sum(it["durationMinutes"] for it in plan_items)

        return {
            "title": f"Daily Focus ({daily_minutes} min)",
            "planType": "daily",
            "startDate": today_date_str,
            "endDate": today_date_str,
            "dailyMinutes": daily_minutes,
            "scheduledMinutes": total_scheduled,
            "items": plan_items,
        }

    def build_weekly_plan(
        self,
        recommendations: List[Dict[str, Any]],
        daily_minutes: int = 30,
        preferred_days: Optional[List[str]] = None,
        start_date_str: Optional[str] = None,
    ) -> Dict[str, Any]:
        start_dt = datetime.fromisoformat(start_date_str) if start_date_str else datetime.now()
        start_date_str = start_dt.strftime("%Y-%m-%d")
        end_date_str = (start_dt + timedelta(days=6)).strftime("%Y-%m-%d")

        preferred_days = preferred_days or ["Mon", "Tue", "Wed", "Thu", "Fri"]
        day_abbrevs = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

        sorted_recs = sorted(recommendations, key=lambda r: float(r.get("priorityScore", 0)), reverse=True)

        all_items = []
        rec_idx = 0

        for day_offset in range(7):
            current_dt = start_dt + timedelta(days=day_offset)
            current_date_str = current_dt.strftime("%Y-%m-%d")
            day_name = day_abbrevs[current_dt.weekday()]

            if day_name not in preferred_days:
                continue

            remaining_minutes = daily_minutes
            while remaining_minutes >= 5 and rec_idx < len(sorted_recs):
                rec = sorted_recs[rec_idx]
                act_type, duration = self._select_activity_for_recommendation(rec, remaining_minutes)
                if duration <= 0 or duration > remaining_minutes:
                    break

                best_source = (rec.get("recommendedSourceIds") or [None])[0]

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
                    "reason": rec.get("reasonSummary", "Weekly priority curriculum"),
                    "status": "pending",
                })

                remaining_minutes -= duration
                rec_idx += 1

            if rec_idx >= len(sorted_recs):
                # Loop back to reinforce top weak concepts with practice
                rec_idx = 0

        return {
            "title": "Weekly Study Schedule",
            "planType": "weekly",
            "startDate": start_date_str,
            "endDate": end_date_str,
            "dailyMinutes": daily_minutes,
            "preferredStudyDays": preferred_days,
            "items": all_items,
        }

    def rebalance_items(
        self,
        existing_items: List[Dict[str, Any]],
        today_date_str: str,
    ) -> List[Dict[str, Any]]:
        """
        Rebalances missed items by moving past pending items to today or next dates
        without creating duplicate items (Section 35 & 36).
        """
        rebalanced = []
        seen_concepts_today = set()

        for it in existing_items:
            # Completed items stay untouched
            if it.get("status") == "completed":
                rebalanced.append(it)
                continue

            item_date = it.get("date", "")
            c_id = str(it.get("conceptId", ""))

            if item_date < today_date_str and it.get("status") == "pending":
                # Missed item: reschedule to today if not already scheduled
                if c_id not in seen_concepts_today:
                    seen_concepts_today.add(c_id)
                    updated_it = dict(it)
                    updated_it["date"] = today_date_str
                    updated_it["status"] = "pending"
                    rebalanced.append(updated_it)
            else:
                if item_date == today_date_str:
                    seen_concepts_today.add(c_id)
                rebalanced.append(it)

        return rebalanced

    def _select_activity_for_recommendation(self, rec: Dict[str, Any], budget: int) -> tuple[str, int]:
        rec_type = rec.get("recommendationType", "review")
        best_source = (rec.get("recommendedSourceIds") or [None])[0]
        modality = best_source.get("modality") if best_source else None

        if rec_type == "remediate_prerequisite":
            return "concept_revision", min(15, budget)
        elif rec_type == "address_misconception":
            return "tutor_review", min(10, budget)
        elif rec_type == "practice":
            return "practice_quiz", min(12, budget)
        elif rec_type == "spaced_review":
            return "concept_revision", min(10, budget)
        elif modality == "video":
            return "watch_video", min(10, budget)
        elif modality == "diagram":
            return "review_visual", min(8, budget)
        else:
            return "review_source", min(10, budget)

