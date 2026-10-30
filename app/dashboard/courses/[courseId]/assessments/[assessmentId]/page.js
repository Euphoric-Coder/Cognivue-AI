"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  RotateCcw,
  Sparkles,
  Clock,
  Award,
  Layers,
  Trash2,
  AlertCircle,
  HelpCircle,
  FileCheck2,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function AssessmentDetailPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId, assessmentId } = unwrappedParams;
  const router = useRouter();

  const assessment = useQuery(api.assessments.getAssessment, { assessmentId });
  const questions = useQuery(api.assessments.getAssessmentQuestions, { assessmentId });
  const startAttempt = useMutation(api.assessments.startAttempt);
  const removeQuestion = useMutation(api.assessments.removeQuestion);

  const [isStarting, setIsStarting] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  if (assessment === undefined || questions === undefined) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Assessment Not Found</h2>
        <p className="text-muted-foreground">The assessment does not exist or you lack permission.</p>
        <Link href={`/dashboard/courses/${courseId}/assessments`}>
          <Button variant="outline">Back to Assessments</Button>
        </Link>
      </div>
    );
  }

  const handleStartAttempt = async () => {
    try {
      setIsStarting(true);
      const attemptId = await startAttempt({
        courseId,
        assessmentId,
      });
      toast.success("Attempt started! Good luck.");
      router.push(`/dashboard/courses/${courseId}/assessments/${assessmentId}/attempt/${attemptId}`);
    } catch (err) {
      setIsStarting(false);
      toast.error(err.message || "Failed to start attempt");
    }
  };

  const handleRegenerateQuestion = async (q) => {
    try {
      setRegeneratingId(q._id);
      const res = await fetch("/api/assessments/regenerate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          assessmentId,
          questionId: q._id,
          conceptId: q.conceptIds?.[0],
          difficulty: q.difficulty,
          questionType: q.questionType,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Regeneration failed");
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Could not generate replacement question");
      }

      toast.success("Question regenerated and verified!");
    } catch (err) {
      toast.error(err.message || "Failed to regenerate question");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRemoveQuestion = async (qId) => {
    if (!confirm("Are you sure you want to remove this question?")) return;
    try {
      setRemovingId(qId);
      await removeQuestion({ assessmentId, questionId: qId });
      toast.success("Question removed.");
    } catch (err) {
      toast.error(err.message || "Cannot remove question");
    } finally {
      setRemovingId(null);
    }
  };

  const attempts = assessment.attempts || [];
  const completedAttempts = attempts.filter((a) => a.status === "graded" || a.status === "submitted");
  const inProgressAttempt = attempts.find((a) => a.status === "in_progress");

  const isGenerating = assessment.status === "generating";
  const isFailed = assessment.status === "failed";
  const hasStartedAttempts = attempts.length > 0;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8">
      {/* Back button */}
      <div>
        <Link
          href={`/dashboard/courses/${courseId}/assessments`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Assessments
        </Link>
      </div>

      {/* Main Banner */}
      <Card className="border-primary/20 bg-card shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {assessment.assessmentType.replace("_", " ")}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {assessment.difficulty}
              </Badge>
              <Badge
                className={
                  assessment.status === "ready"
                    ? "bg-emerald-600 text-white"
                    : assessment.status === "generating"
                    ? "bg-blue-600 text-white"
                    : "bg-muted text-foreground"
                }
              >
                {assessment.status}
              </Badge>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {inProgressAttempt ? (
                <Link
                  href={`/dashboard/courses/${courseId}/assessments/${assessmentId}/attempt/${inProgressAttempt._id}`}
                >
                  <Button className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700">
                    <Play className="w-4 h-4" />
                    Resume Attempt
                  </Button>
                </Link>
              ) : assessment.status === "ready" ? (
                <Button
                  onClick={handleStartAttempt}
                  disabled={isStarting}
                  className="flex items-center gap-2 shadow-sm"
                >
                  <Play className="w-4 h-4" />
                  {attempts.length > 0 ? "Retake Assessment" : "Start Assessment"}
                </Button>
              ) : null}
            </div>
          </div>

          <CardTitle className="text-2xl font-bold mt-2">{assessment.title}</CardTitle>
          <CardDescription className="text-sm">
            {assessment.description || "Grounded assessment generated from course material."}
          </CardDescription>
        </CardHeader>

        {/* Summary Info Grid */}
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t">
          <div>
            <span className="text-xs text-muted-foreground">Questions</span>
            <div className="text-lg font-bold">{questions.length}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Total Points</span>
            <div className="text-lg font-bold">{assessment.totalPoints || questions.length} pts</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Estimated Time</span>
            <div className="text-lg font-bold">
              {assessment.timeLimitMinutes
                ? `${assessment.timeLimitMinutes} mins (Strict)`
                : `${assessment.estimatedDurationMinutes || questions.length * 2} mins`}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Completed Attempts</span>
            <div className="text-lg font-bold">{completedAttempts.length}</div>
          </div>
        </CardContent>
      </Card>

      {/* Generating State */}
      {isGenerating && (
        <Card className="border-blue-500/30 bg-blue-500/5 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin mx-auto" />
          <h3 className="text-lg font-semibold">Generating and Validating Questions</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Gemini is structuring candidate questions and second-pass filters are eliminating distractors and ensuring exact source grounding. This takes a few seconds...
          </p>
        </Card>
      )}

      {/* Failed State */}
      {isFailed && (
        <Card className="border-destructive/30 bg-destructive/5 p-6 space-y-3">
          <div className="flex items-center gap-2 text-destructive font-semibold">
            <AlertCircle className="w-5 h-5" />
            <span>Assessment Generation Incomplete</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {assessment.error || "Could not validate sufficient candidate questions against uploaded material."}
          </p>
          <Link href={`/dashboard/courses/${courseId}/assessments/new`}>
            <Button size="sm" variant="outline" className="mt-2">
              Try Creating with Different Concepts
            </Button>
          </Link>
        </Card>
      )}

      {/* Attempt History Section */}
      {attempts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <CardTitle className="text-base font-semibold">Past Attempts</CardTitle>
            </div>
            <CardDescription>Performance history for this assessment.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {attempts.map((att, idx) => {
                const dateStr = att.startedAt ? new Date(att.startedAt).toLocaleDateString() : "Recent";
                const isCompleted = att.status === "graded" || att.status === "submitted";
                return (
                  <div key={att._id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs">
                        #{attempts.length - idx}
                      </div>
                      <div>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span>Attempt {attempts.length - idx}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {att.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {dateStr} {att.timeSpentSeconds && `· ${Math.round(att.timeSpentSeconds / 60)} mins`}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {isCompleted ? (
                        <div className="text-right">
                          <div className="text-base font-bold text-primary">
                            {att.percentage !== undefined ? `${att.percentage}%` : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {att.score} / {att.maxScore} pts
                          </div>
                        </div>
                      ) : (
                        <Badge variant="secondary">In Progress</Badge>
                      )}

                      {isCompleted ? (
                        <Link
                          href={`/dashboard/courses/${courseId}/assessments/${assessmentId}/results/${att._id}`}
                        >
                          <Button size="sm" variant="outline" className="flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5" />
                            Review
                          </Button>
                        </Link>
                      ) : (
                        <Link
                          href={`/dashboard/courses/${courseId}/assessments/${assessmentId}/attempt/${att._id}`}
                        >
                          <Button size="sm" className="flex items-center gap-1.5">
                            <Play className="w-3.5 h-3.5" />
                            Resume
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions Preview & Draft Controls */}
      {questions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  Assessment Questions ({questions.length})
                </CardTitle>
                <CardDescription>
                  Grounded questions generated for this assessment.
                  {!hasStartedAttempts && " You can regenerate individual questions before attempting."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div
                  key={q._id}
                  className="p-4 rounded-xl border bg-muted/10 hover:bg-muted/20 transition-colors space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-muted-foreground">
                        Q{idx + 1}.
                      </span>
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {q.questionType.replace("_", " ")}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px] capitalize">
                        {q.difficulty}
                      </Badge>
                      {q.conceptNames?.[0] && (
                        <Badge variant="outline" className="text-[11px] bg-primary/5 text-primary">
                          {q.conceptNames[0]}
                        </Badge>
                      )}
                    </div>

                    {/* Pre-attempt draft controls */}
                    {!hasStartedAttempts && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={regeneratingId === q._id}
                          onClick={() => handleRegenerateQuestion(q)}
                          className="h-7 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          title="Regenerate this question with fresh grounded evidence"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${regeneratingId === q._id ? "animate-spin" : ""}`}
                          />
                          Regenerate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removingId === q._id || questions.length <= 1}
                          onClick={() => handleRemoveQuestion(q._id)}
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          title="Remove question"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <p className="text-sm font-medium text-foreground">{q.questionText}</p>

                  {/* Visual indication if attached */}
                  {q.sourceVisualUrl && (
                    <div className="text-xs text-primary flex items-center gap-1 font-medium">
                      <span>Contains diagram / visual asset</span>
                    </div>
                  )}

                  {/* Options preview for MCQ */}
                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                      {q.options.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className="text-xs p-2 rounded-md border bg-background/50 text-muted-foreground line-clamp-1"
                        >
                          {String.fromCharCode(65 + oIdx)}. {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="border-t pt-4 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              All questions are verified against source material.
            </span>
            {assessment.status === "ready" && (
              <Button onClick={handleStartAttempt} disabled={isStarting} className="flex items-center gap-2">
                <Play className="w-4 h-4" />
                Start Assessment
              </Button>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
