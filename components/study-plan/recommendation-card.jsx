"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  BookOpen,
  FileCheck2,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

export function RecommendationCard({ recommendation, courseId, onDismissed }) {
  const router = useRouter();
  const dismissMutation = useMutation(api.studyIntelligence.dismissRecommendation);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const rec = recommendation;
  const isCritical = rec.priorityBand === "critical";
  const isHigh = rec.priorityBand === "high";

  const getPriorityBadge = (band) => {
    switch (band) {
      case "critical":
        return <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold uppercase tracking-wider">Critical</Badge>;
      case "high":
        return <Badge className="bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider">High</Badge>;
      case "medium":
        return <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wider">Medium</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wider">Low</Badge>;
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case "remediate_prerequisite":
        return <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">Prerequisite Remediation</Badge>;
      case "address_misconception":
        return <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 bg-destructive/10">Active Misconception</Badge>;
      case "spaced_review":
        return <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20">Spaced Review Due</Badge>;
      case "practice":
        return <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20">Practice Quiz</Badge>;
      case "learn":
        return <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20">Core Coverage</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">Review</Badge>;
    }
  };

  const handleAskTutor = () => {
    const q = `Explain ${rec.conceptName} and help me practice the key principles from my course sources.`;
    router.push(
      `/dashboard/courses/${courseId}/tutor?initialQuestion=${encodeURIComponent(q)}&focusConceptId=${rec.conceptId}`
    );
  };

  const handleTakeQuiz = () => {
    router.push(
      `/dashboard/courses/${courseId}/assessments/new?conceptId=${rec.conceptId}&mode=practice`
    );
  };

  const handleDismiss = async () => {
    try {
      setIsDismissing(true);
      await dismissMutation({ recommendationId: rec._id });
      toast.info(`Dismissed recommendation for ${rec.conceptName}.`);
      if (onDismissed) onDismissed(rec._id);
    } catch (err) {
      console.error(err);
      toast.error("Failed to dismiss recommendation.");
    } finally {
      setIsDismissing(false);
    }
  };

  const sources = rec.recommendedSourceIds || [];
  const details = rec.reasonDetails || {};

  return (
    <Card className={`border transition-all duration-150 ${
      isCritical
        ? "border-destructive/40 shadow-xs bg-card"
        : isHigh
        ? "border-amber-400/40 shadow-2xs bg-card"
        : "border-border shadow-2xs bg-card"
    }`}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-base text-foreground truncate">
                {rec.conceptName}
              </span>
              {getPriorityBadge(rec.priorityBand)}
              {getTypeBadge(rec.recommendationType)}
              <span className="text-xs text-muted-foreground font-mono ml-auto">
                Priority: {Math.round(rec.priorityScore)}/100
              </span>
            </div>

            <CardDescription className="text-xs text-foreground/80 font-medium">
              {rec.reasonSummary}
            </CardDescription>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0"
            onClick={handleDismiss}
            disabled={isDismissing}
            title="Dismiss recommendation"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-1 space-y-3">
        {/* Recommended Sources (Section 13 & 14) */}
        {sources.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              Recommended Course Evidence
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sources.map((s, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border bg-muted/20 flex flex-col justify-between text-xs space-y-1"
                >
                  <div>
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      {s.modality === "video" ? (
                        <Video className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      ) : s.modality === "diagram" ? (
                        <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      ) : (
                        <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                      <span className="truncate">{s.sourceName}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {s.evidenceReason}
                    </p>
                  </div>
                  {s.sourceId && (
                    <div className="pt-1 text-right">
                      <Link href={`/dashboard/courses/${courseId}/sources/${s.sourceId}`}>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-primary hover:underline">
                          View Material <ExternalLink className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Why Recommended Expandable Section (Section 44) */}
        <div className="border-t pt-2">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Evidence breakdown & diagnostics</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {isExpanded && (
            <div className="mt-2 p-2.5 rounded-lg bg-muted/40 border text-xs grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
              <div>
                <span className="block text-[10px] uppercase font-semibold text-foreground/70">Mastery</span>
                <span className="text-foreground font-medium">
                  {details.mastery !== undefined ? `${details.mastery}%` : "Not Assessed"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-semibold text-foreground/70">Confidence</span>
                <span className="text-foreground font-medium capitalize">
                  {details.confidence || "Neutral"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-semibold text-foreground/70">Recent Errors</span>
                <span className="text-foreground font-medium">
                  {details.recentErrors || 0}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-semibold text-foreground/70">Prerequisite Blocker</span>
                <span className="text-foreground font-medium">
                  {details.isPrerequisiteBlocker ? "Yes (Blocking)" : "No"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleAskTutor}
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
            Ask Tutor
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleTakeQuiz}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            Practice Quiz
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

