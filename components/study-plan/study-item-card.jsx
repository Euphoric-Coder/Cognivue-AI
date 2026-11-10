"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Clock,
  BookOpen,
  Video,
  FileCheck2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

export function StudyItemCard({ item, courseId, onCompleted }) {
  const router = useRouter();
  const completeItem = useMutation(api.studyIntelligence.completeStudyPlanItem);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const isCompleted = item.status === "completed";

  const handleToggleComplete = async () => {
    if (isCompleted) return;
    try {
      setIsCompleting(true);
      await completeItem({ itemId: item._id });
      toast.success(`Completed "${item.conceptName || "study activity"}"! Logged to study activity history.`);
      if (onCompleted) onCompleted(item._id);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to mark item complete.");
    } finally {
      setIsCompleting(false);
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case "watch_video":
        return <Video className="w-3.5 h-3.5 text-blue-500" />;
      case "review_visual":
        return <Layers className="w-3.5 h-3.5 text-indigo-500" />;
      case "practice_quiz":
      case "mock_exam":
        return <FileCheck2 className="w-3.5 h-3.5 text-amber-500" />;
      case "tutor_review":
        return <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-primary" />;
    }
  };

  const getActivityLabel = (type) => {
    switch (type) {
      case "watch_video":
        return "Video Lecture";
      case "review_visual":
        return "Visual Diagram";
      case "practice_quiz":
        return "Practice Quiz";
      case "mock_exam":
        return "Mock Exam";
      case "tutor_review":
        return "AI Tutor Review";
      case "concept_revision":
        return "Concept Revision";
      default:
        return "Source Review";
    }
  };

  const getPriorityBadge = (p) => {
    switch (p) {
      case "critical":
        return <Badge className="bg-destructive text-destructive-foreground text-[10px] uppercase font-bold px-1.5 py-0">Critical</Badge>;
      case "high":
        return <Badge className="bg-amber-500 text-white text-[10px] uppercase font-bold px-1.5 py-0">High</Badge>;
      case "medium":
        return <Badge variant="secondary" className="text-[10px] uppercase font-medium px-1.5 py-0">Medium</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] uppercase font-medium px-1.5 py-0">Low</Badge>;
    }
  };

  const handleAskTutor = () => {
    const q = `Explain ${item.conceptName || "this concept"} and guide me through the key points using course materials.`;
    router.push(
      `/dashboard/courses/${courseId}/tutor?initialQuestion=${encodeURIComponent(q)}${
        item.conceptId ? `&focusConceptId=${item.conceptId}` : ""
      }`
    );
  };

  const handlePracticeQuiz = () => {
    router.push(
      `/dashboard/courses/${courseId}/assessments/new?conceptId=${item.conceptId || ""}&mode=practice`
    );
  };

  return (
    <div
      className={`p-4 rounded-xl border transition-all duration-150 ${
        isCompleted
          ? "bg-muted/30 border-muted opacity-75"
          : "bg-card hover:bg-muted/20 border-border shadow-2xs hover:shadow-xs"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Completion checkbox & title */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={handleToggleComplete}
            disabled={isCompleting || isCompleted}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:cursor-default"
          >
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
            ) : (
              <Circle className="w-5 h-5 hover:text-primary" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`font-semibold text-sm truncate ${
                  isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                {item.conceptName || "General Study Activity"}
              </span>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-medium py-0 px-1.5 gap-1 inline-flex items-center">
                  {getActivityIcon(item.activityType)}
                  {getActivityLabel(item.activityType)}
                </Badge>
                {getPriorityBadge(item.priority)}
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 ml-1">
                  <Clock className="w-3 h-3" />
                  {item.durationMinutes}m
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground line-clamp-2">
              {item.reason}
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setIsExpanding(!isExpanding)}
          >
            {isExpanding ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Expandable Evidence & Action Panel */}
      {isExpanding && (
        <div className="mt-3 pt-3 border-t border-border/60 text-xs space-y-3">
          {item.sourceDetails && (
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-medium text-foreground flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  Recommended Source: {item.sourceDetails.sourceName}
                </div>
                <div className="text-muted-foreground text-[11px]">
                  {item.sourceDetails.evidenceReason}
                </div>
              </div>
              {item.sourceId && (
                <Link href={`/dashboard/courses/${courseId}/sources/${item.sourceId}`}>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 shrink-0">
                    Open Source <ExternalLink className="w-3 h-3" />
                  </Button>
                </Link>
              )}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <div className="text-[11px] text-muted-foreground">
              {isCompleted ? "Marked complete (engagement logged)" : "Scheduled for today"}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleAskTutor}
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                Ask Tutor
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handlePracticeQuiz}
              >
                <FileCheck2 className="w-3.5 h-3.5 text-amber-500" />
                Practice Quiz
              </Button>
              {!isCompleted && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleToggleComplete}
                  disabled={isCompleting}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Complete
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

