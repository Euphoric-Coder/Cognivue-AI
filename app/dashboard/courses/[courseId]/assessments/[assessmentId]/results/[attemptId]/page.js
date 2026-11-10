"use client";

import { use, useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Clock,
  ArrowLeft,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  BookOpen,
  CalendarCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function AssessmentResultsPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId, assessmentId, attemptId } = unwrappedParams;
  const router = useRouter();

  const data = useQuery(api.assessments.getAttemptResponses, { attemptId });
  const startAttempt = useMutation(api.assessments.startAttempt);
  const learnerDeltas = useQuery(api.learnerModel.getAttemptLearnerDeltas, { attemptId });
  const deltasList = Array.isArray(learnerDeltas)
    ? learnerDeltas
    : (learnerDeltas?.conceptDeltas || []);

  const [isRetaking, setIsRetaking] = useState(false);

  const reviewItems = data?.reviewItems;

  // Concept performance calculation (Requirement 54)
  const conceptStats = useMemo(() => {
    if (!reviewItems) return {};
    const stats = {};
    for (const item of reviewItems) {
      const q = item.question;
      const cNames = q.conceptNames && q.conceptNames.length > 0 ? q.conceptNames : ["General"];
      for (const cName of cNames) {
        if (!stats[cName]) {
          stats[cName] = { correct: 0, total: 0, pointsAwarded: 0, pointsTotal: 0 };
        }
        stats[cName].total += 1;
        stats[cName].pointsTotal += q.points;
        if (item.isCorrect) {
          stats[cName].correct += 1;
        }
        stats[cName].pointsAwarded += item.awardedPoints;
      }
    }
    return stats;
  }, [reviewItems]);

  if (data === undefined) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.attempt || !data.assessment) {
    return (
      <div className="max-w-md mx-auto p-12 text-center space-y-4">
        <h2 className="text-xl font-bold">Results Not Available</h2>
        <Link href={`/dashboard/courses/${courseId}/assessments`}>
          <Button variant="outline">Back to Assessments</Button>
        </Link>
      </div>
    );
  }

  const { attempt, assessment } = data;

  const handleRetakeSame = async () => {
    try {
      setIsRetaking(true);
      const newAttemptId = await startAttempt({
        courseId,
        assessmentId,
      });
      toast.success("Retake started!");
      router.push(`/dashboard/courses/${courseId}/assessments/${assessmentId}/attempt/${newAttemptId}`);
    } catch (err) {
      setIsRetaking(false);
      toast.error(err.message || "Failed to start retake");
    }
  };

  const formatDuration = (secs) => {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const pct = attempt.percentage !== undefined ? attempt.percentage : Math.round((attempt.score / (attempt.maxScore || 1)) * 100);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/courses/${courseId}/assessments/${assessmentId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Assessment Overview
        </Link>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleRetakeSame}
            disabled={isRetaking}
            className="flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retake Same Questions
          </Button>

          <Link href={`/dashboard/courses/${courseId}/assessments/new`}>
            <Button size="sm" variant="outline" className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Generate Fresh
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero Score Banner */}
      <Card className="border-primary/30 shadow-md bg-card">
        <CardHeader className="text-center pb-2">
          <Badge variant="outline" className="w-fit mx-auto capitalize mb-1">
            {assessment.assessmentType.replace("_", " ")} Complete
          </Badge>
          <CardTitle className="text-2xl md:text-3xl font-extrabold">{assessment.title}</CardTitle>
          <CardDescription>
            Completed on {new Date(attempt.submittedAt || attempt.createdAt).toLocaleString()}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          {/* Big Score Display */}
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-muted/40 border">
            <div className="text-5xl md:text-6xl font-black tracking-tight text-primary">
              {pct}%
            </div>
            <div className="text-sm font-semibold text-muted-foreground mt-1">
              Score: {attempt.score} / {attempt.maxScore} points
            </div>
          </div>

          {/* Breakdown Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl border bg-muted/20">
              <span className="text-xs text-muted-foreground">Correct</span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {attempt.correctCount ?? 0}
              </div>
            </div>

            <div className="p-3 rounded-xl border bg-muted/20">
              <span className="text-xs text-muted-foreground">Incorrect</span>
              <div className="text-xl font-bold text-destructive">
                {attempt.incorrectCount ?? 0}
              </div>
            </div>

            <div className="p-3 rounded-xl border bg-muted/20">
              <span className="text-xs text-muted-foreground">Unanswered</span>
              <div className="text-xl font-bold text-muted-foreground">
                {attempt.unansweredCount ?? 0}
              </div>
            </div>

            <div className="p-3 rounded-xl border bg-muted/20">
              <span className="text-xs text-muted-foreground">Time Spent</span>
              <div className="text-xl font-bold text-foreground">
                {formatDuration(attempt.timeSpentSeconds)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Concept Performance Table (Requirement 54) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Concept Performance</CardTitle>
          <CardDescription>
            Performance breakdown per course concept for this attempt. (Attempt-level performance only)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(conceptStats).map(([conceptName, stat]) => {
              const cPct = Math.round((stat.correct / stat.total) * 100);
              return (
                <div key={conceptName} className="space-y-1.5 p-3 rounded-lg border bg-muted/10">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold">{conceptName}</span>
                    <span className="font-mono text-xs font-bold">
                      {stat.correct} / {stat.total} ({cPct}%)
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        cPct >= 80 ? "bg-emerald-500" : cPct >= 50 ? "bg-amber-500" : "bg-destructive"
                      }`}
                      style={{ width: `${cPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Learner Model Updated Section (Requirement 50 & 51) */}
      {deltasList.length > 0 && (
        <Card className="border-primary/30 shadow-xs bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <CardTitle className="text-base font-semibold">Learner Model Updated</CardTitle>
              </div>
              <Link href={`/dashboard/courses/${courseId}/progress`}>
                <span className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-1">
                  View Full Progress <ExternalLink className="w-3 h-3" />
                </span>
              </Link>
            </div>
            <CardDescription>
              Changes in your persistent concept mastery derived from this assessment attempt.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {deltasList.map((d) => {
                const deltaNum = d.delta ?? (d.after - d.before);
                const isPositive = deltaNum > 0;
                const isNegative = deltaNum < 0;

                return (
                  <div key={d.conceptId} className="p-3.5 rounded-xl border bg-muted/20 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground truncate">{d.conceptName}</div>
                      <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider py-0 px-1 capitalize">
                          {d.masteryBand.replace(/_/g, " ")}
                        </Badge>
                        <span>•</span>
                        <span>{d.confidence} conf.</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs text-muted-foreground">{d.before}% →</span>
                      <span className="font-mono text-sm font-bold text-foreground">{d.after}%</span>
                      <Badge
                        variant="outline"
                        className={`font-mono font-bold text-[10px] ${
                          isPositive
                            ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                            : isNegative
                            ? "text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isPositive ? `+${deltaNum}%` : `${deltaNum}%`}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommended Next Steps (Requirement 48 & V10) */}
      <Card className="border bg-card shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
              <CardTitle className="text-base font-semibold">Recommended Next Steps</CardTitle>
            </div>
            <Link href={`/dashboard/courses/${courseId}/study-plan`}>
              <span className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-1">
                Open Personal Study Plan <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <CardDescription>
            Personalized study actions generated from your performance and persistent mastery updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl border bg-muted/20">
            <div className="text-xs text-foreground">
              <div className="font-semibold mb-0.5">Focus your next study session</div>
              <p className="text-muted-foreground">
                Your study priorities and spaced review queue have been automatically updated based on this attempt.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href={`/dashboard/courses/${courseId}/tutor?initialQuestion=${encodeURIComponent("Review my mistakes from my recent assessment attempt and explain what I should focus on.")}`}>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  Review with AI Tutor
                </Button>
              </Link>
              <Link href={`/dashboard/courses/${courseId}/study-plan`}>
                <Button size="sm" className="h-8 text-xs">
                  View Study Plan
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Question by Question Review (Requirement 55) */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold">Detailed Question Review</h3>

        <div className="space-y-4">
          {reviewItems.map((item, idx) => {
            const q = item.question;
            const isCorrect = item.isCorrect;
            const isAnswered = item.isAnswered;

            return (
              <Card
                key={q._id}
                className={`overflow-hidden border-2 transition-all ${
                  isCorrect
                    ? "border-emerald-500/30"
                    : isAnswered
                    ? "border-destructive/30"
                    : "border-muted"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground">Q{idx + 1}.</span>
                      <Badge variant="outline" className="capitalize text-xs">
                        {q.questionType.replace("_", " ")}
                      </Badge>
                      <Badge variant="secondary" className="capitalize text-xs">
                        {q.difficulty}
                      </Badge>
                      {q.conceptNames?.[0] && (
                        <Badge variant="outline" className="text-xs bg-primary/5 text-primary">
                          {q.conceptNames[0]}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {item.awardedPoints} / {item.maxPoints} pts
                      </span>
                      {isCorrect ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Correct
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {isAnswered ? "Incorrect" : "Unanswered"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <CardTitle className="text-base font-semibold mt-2 leading-relaxed">
                    {q.questionText}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Visual Asset if present */}
                  {q.sourceVisualUrl && (
                    <div className="rounded-lg border overflow-hidden bg-muted/20 max-w-md">
                      <img
                        src={q.sourceVisualUrl}
                        alt="Question diagram"
                        className="w-full max-h-60 object-contain p-2"
                      />
                    </div>
                  )}

                  {/* Student Answer */}
                  <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                    <span className="text-xs font-bold text-muted-foreground">Your Answer:</span>
                    <div
                      className={`text-sm font-medium ${
                        isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                      }`}
                    >
                      {item.userAnswer === null || item.userAnswer === undefined
                        ? "No answer submitted."
                        : Array.isArray(item.userAnswer)
                        ? item.userAnswer.join(", ")
                        : String(item.userAnswer)}
                    </div>
                  </div>

                  {/* Correct Answer (if incorrect or explanation) */}
                  {!isCorrect && (
                    <div className="p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20 space-y-1">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        Expected / Reference Answer:
                      </span>
                      <div className="text-sm font-medium text-foreground">
                        {q.referenceAnswer ||
                          (typeof q.correctAnswer === "object"
                            ? JSON.stringify(q.correctAnswer)
                            : String(q.correctAnswer))}
                      </div>
                    </div>
                  )}

                  {/* Subjective Feedback & Rubric points if available */}
                  {item.feedback && (
                    <div className="p-3 rounded-lg border bg-blue-500/5 border-blue-500/20 text-xs space-y-1">
                      <span className="font-bold text-blue-600 dark:text-blue-400">Feedback:</span>
                      <p className="text-muted-foreground">{item.feedback}</p>
                    </div>
                  )}

                  {/* Grounded Explanation */}
                  <div className="text-xs text-muted-foreground space-y-1 pt-1">
                    <span className="font-semibold text-foreground">Explanation:</span>
                    <p className="leading-relaxed">{q.explanation}</p>
                  </div>

                  {/* Exact Source Evidence (Requirement 55 & 56) */}
                  {q.sourceEvidence && q.sourceEvidence.length > 0 && (
                    <div className="pt-2 border-t space-y-2">
                      <span className="text-xs font-bold text-muted-foreground">
                        Source Evidence:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.sourceEvidence.map((ev, eIdx) => {
                          let locText = "Document";
                          if (ev.pageNumber) locText = `Page ${ev.pageNumber}`;
                          else if (ev.slideNumber) locText = `Slide ${ev.slideNumber}`;
                          else if (ev.startTime !== undefined) locText = `Video ${ev.startTime}s - ${ev.endTime}s`;

                          return (
                            <Link
                              key={eIdx}
                              href={`/dashboard/courses/${courseId}/sources/${ev.sourceId}`}
                              className="p-2.5 rounded-lg border hover:border-primary/50 transition-colors flex items-start justify-between gap-2 text-xs bg-card group"
                            >
                              <div className="space-y-0.5">
                                <div className="font-semibold text-primary group-hover:underline flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>{ev.sourceName}</span>
                                </div>
                                <div className="text-muted-foreground font-mono text-[11px]">
                                  {locText} · {ev.evidenceType}
                                </div>
                                {ev.excerpt && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-1 italic mt-1">
                                    &ldquo;{ev.excerpt}&rdquo;
                                  </p>
                                )}
                              </div>
                              <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5" />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Review with Tutor for incorrect questions (V9 Requirement #76) */}
                  {!isCorrect && (
                    <div className="pt-3 border-t flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Need help understanding your mistake?
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 border-primary/30 hover:bg-primary/10 flex items-center gap-1.5 font-medium"
                        onClick={() => {
                          const qId = q._id;
                          const rId = item._id;
                          router.push(
                            `/dashboard/courses/${courseId}/tutor?reviewQuestionId=${qId}${rId ? `&reviewResponseId=${rId}` : ""}`
                          );
                        }}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        Review with Tutor
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
