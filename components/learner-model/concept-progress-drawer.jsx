"use client";

import React, { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Layers,
  MessageSquare,
  Network,
  ExternalLink,
  ShieldCheck,
  CalendarCheck,
  FileQuestion
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ConceptProgressDrawer({
  conceptId,
  courseId,
  isOpen,
  onClose,
}) {
  const router = useRouter();

  const details = useQuery(
    api.learnerModel.getConceptLearnerDetails,
    conceptId ? { courseId, conceptId } : "skip"
  );

  const misconceptions = useQuery(
    api.adaptiveTutor.getLearnerMisconceptions,
    courseId ? { courseId, activeOnly: true } : "skip"
  );

  const conceptMisconceptions = useMemo(() => {
    if (!misconceptions || !conceptId) return [];
    return misconceptions.filter((m) => m.conceptId === conceptId);
  }, [misconceptions, conceptId]);

  if (!conceptId) return null;

  const handleAskTutor = (conceptName) => {
    const isWeak = details?.masteryBand === "needs_attention" || details?.masteryBand === "developing";
    const q = isWeak
      ? `Review ${conceptName} with me step by step.`
      : `Explain ${conceptName} and help me practice based on my current understanding.`;
    router.push(
      `/dashboard/courses/${courseId}/tutor?initialQuestion=${encodeURIComponent(q)}&focusConceptId=${conceptId}`
    );
  };

  const getBandBadge = (band) => {
    switch (band) {
      case "strong":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Strong</Badge>;
      case "proficient":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">Proficient</Badge>;
      case "developing":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-semibold">Developing</Badge>;
      case "needs_attention":
        return <Badge variant="destructive" className="font-semibold">Needs Attention</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground border-dashed">Not Assessed</Badge>;
    }
  };

  const getConfidenceBadge = (confidence) => {
    switch (confidence) {
      case "high":
        return <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/40">High Confidence</Badge>;
      case "medium":
        return <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-500/40">Medium Confidence</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground border-dashed">Low / Provisional</Badge>;
    }
  };

  const getTrendIcon = (trend) => {
    switch (trend) {
      case "improving":
        return <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-xs"><TrendingUp className="w-3.5 h-3.5" /> Improving</span>;
      case "declining":
        return <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium text-xs"><TrendingDown className="w-3.5 h-3.5" /> Declining</span>;
      case "stable":
        return <span className="inline-flex items-center gap-1 text-muted-foreground font-medium text-xs"><Minus className="w-3.5 h-3.5" /> Stable</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-muted-foreground text-xs"><HelpCircle className="w-3.5 h-3.5" /> Insufficient Data</span>;
    }
  };

  const getReadinessBadge = (readiness) => {
    switch (readiness) {
      case "ready":
        return <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">Prerequisites Ready</Badge>;
      case "developing":
        return <Badge className="bg-amber-600/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">Prerequisites Developing</Badge>;
      case "needs_attention":
        return <Badge className="bg-rose-600/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">Prerequisites Need Attention</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground text-[10px]">No Graph Prerequisites</Badge>;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[92vw] sm:w-[520px] p-0 flex flex-col h-full bg-background border-l overflow-hidden">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b bg-muted/20">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {details?.concept?.importance && (
              <Badge variant={details.concept.importance === "core" ? "default" : "secondary"} className="uppercase text-[10px] tracking-wider font-semibold">
                {details.concept.importance}
              </Badge>
            )}
            {details?.concept?.type && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {details.concept.type}
              </Badge>
            )}
            {details?.masteryBand && getBandBadge(details.masteryBand)}
          </div>

          <SheetTitle className="text-xl font-bold tracking-tight text-foreground">
            {details?.conceptName || "Concept Progress"}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground line-clamp-2">
            {details?.concept?.description || "Evidence-based knowledge tracing details."}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!details ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              {/* Mastery Gauge & Key Metrics */}
              <div className="p-5 rounded-2xl bg-card border shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Concept Mastery</span>
                    <div className="text-4xl font-black tracking-tight text-primary mt-0.5">
                      {details.hasEvidence ? `${Math.round(details.masteryProbability * 100)}%` : "—"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {getConfidenceBadge(details.confidence)}
                    {getTrendIcon(details.trend)}
                  </div>
                </div>

                {details.hasEvidence && (
                  <Progress value={Math.round(details.masteryProbability * 100)} className="h-2.5" />
                )}

                <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
                  <div className="p-2 rounded-xl bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Evidence</span>
                    <div className="text-sm font-bold text-foreground mt-0.5">{details.evidenceCount} responses</div>
                  </div>
                  <div className="p-2 rounded-xl bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Recent Score</span>
                    <div className="text-sm font-bold text-foreground mt-0.5">
                      {details.recentScore !== null && details.recentScore !== undefined
                        ? `${Math.round(details.recentScore * 100)}%`
                        : "—"}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-muted/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Model</span>
                    <div className="text-sm font-bold text-foreground mt-0.5">{details.modelVersion || "mastery-v1"}</div>
                  </div>
                </div>
              </div>

              {/* "Why this score?" (Deterministic Explainability) */}
              <div className="p-5 rounded-2xl bg-card border shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Why this score?</h4>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {details.whyThisScore}
                </p>

                {details.hasEvidence && (
                  <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                      {details.correctAttempts || 0} Correct
                    </div>
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                      {details.partialAttempts || 0} Partial
                    </div>
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 font-medium">
                      {details.incorrectAttempts || 0} Incorrect
                    </div>
                  </div>
                )}
              </div>

              {/* Prerequisite Readiness */}
              {details.prerequisitesSummary && details.prerequisitesSummary.length > 0 && (
                <div className="p-5 rounded-2xl bg-card border shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary shrink-0" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Prerequisite Readiness</h4>
                    </div>
                    {getReadinessBadge(details.readiness)}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Readiness reflects your foundational understanding of prerequisite topics from the Knowledge Graph.
                    It does not alter this concept&apos;s own mastery estimate.
                  </p>

                  <div className="space-y-2 pt-1">
                    {details.prerequisitesSummary.map((p) => (
                      <div key={p.conceptId} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border text-xs">
                        <span className="font-medium text-foreground truncate max-w-[220px]">{p.conceptName}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-primary">{p.mastery}%</span>
                          {getBandBadge(p.masteryBand)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Issues / Misconceptions (V9 Requirement #71) */}
              {conceptMisconceptions && conceptMisconceptions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Common Issue Detected</h4>
                  </div>
                  <div className="space-y-2">
                    {conceptMisconceptions.map((m) => (
                      <div key={m._id} className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-1">
                        <p className="text-xs font-medium text-foreground">{m.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Observed in {m.evidenceCount} {m.evidenceCount === 1 ? "response" : "responses"} · Confidence: <span className="capitalize">{m.confidence}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observation History (Auditable Trail) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary shrink-0" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Observation History</h4>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{details.observations?.length || 0} observations</span>
                </div>

                {(!details.observations || details.observations.length === 0) ? (
                  <div className="p-6 text-center rounded-2xl border border-dashed text-xs text-muted-foreground bg-muted/10">
                    No graded assessment responses recorded for this concept yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {details.observations.map((obs) => {
                      const dateStr = obs.timestamp ? new Date(obs.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recent";
                      const pctStr = `${Math.round(obs.scoreFraction * 100)}%`;

                      return (
                        <div key={obs._id} className="p-3.5 rounded-xl border bg-card hover:bg-muted/30 transition-colors space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-foreground">
                              <Badge variant="outline" className="text-[9px] uppercase tracking-wider py-0 px-1.5 capitalize font-bold">
                                {obs.difficulty} {obs.questionType.replace(/_/g, " ")}
                              </Badge>
                              <span>{obs.assessmentTitle}</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground">{dateStr}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1">
                            <div className="flex items-center gap-2">
                              {obs.correctness === "correct" ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                                </span>
                              ) : obs.correctness === "partial" ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                                  <AlertCircle className="w-3.5 h-3.5" /> Partial Credit ({pctStr})
                                </span>
                              ) : obs.correctness === "unanswered" ? (
                                <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                                  <HelpCircle className="w-3.5 h-3.5" /> Unanswered
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                                  <AlertCircle className="w-3.5 h-3.5" /> Incorrect
                                </span>
                              )}
                            </div>

                            <Link
                              href={`/dashboard/courses/${courseId}/assessments/${obs.assessmentId}/results/${obs.attemptId}`}
                              className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                            >
                              Review Attempt <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-background/95 backdrop-blur-md flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => router.push(`/dashboard/courses/${courseId}/knowledge-map`)}
          >
            <Network className="w-3.5 h-3.5 mr-1.5" />
            Knowledge Map
          </Button>

          <Button
            size="sm"
            className="flex-1 text-xs"
            onClick={() => handleAskTutor(details?.conceptName || "this concept")}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            {details?.masteryBand === "needs_attention" || details?.masteryBand === "developing"
              ? "Review with Tutor"
              : "Ask Tutor"}
          </Button>

          <Button
            variant="default"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => router.push(`/dashboard/courses/${courseId}/study-plan`)}
          >
            <CalendarCheck className="w-3.5 h-3.5 mr-1.5" />
            Study Next
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
