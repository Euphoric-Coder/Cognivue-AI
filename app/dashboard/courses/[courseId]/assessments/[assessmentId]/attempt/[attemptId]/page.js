"use client";

import { use, useState, useEffect, useRef, useTransition } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Send,
  Eye,
  FileText,
  Sparkles,
  Maximize2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function AssessmentAttemptPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId, assessmentId, attemptId } = unwrappedParams;
  const router = useRouter();

  // Queries
  const attemptData = useQuery(api.assessments.getAssessmentForAttempt, {
    assessmentId,
    attemptId,
  });

  // Mutations
  const saveResponseMutation = useMutation(api.assessments.saveResponse);
  const submitAttemptMutation = useMutation(api.assessments.submitAttempt);

  // Active question index (0-indexed)
  const [currentIndex, setCurrentIndex] = useState(0);

  // Merged persisted responses
  const existingResponses = attemptData?.existingResponses;
  const persistedAnswers = useMemo(() => {
    const initial = {};
    if (existingResponses) {
      for (const r of existingResponses) {
        if (r.userAnswer !== undefined && r.userAnswer !== null) {
          initial[r.questionId] = r.userAnswer;
        }
      }
    }
    return initial;
  }, [existingResponses]);

  // Local answers map overriding persisted responses
  const [answers, setAnswers] = useState({});
  const [practiceChecked, setPracticeChecked] = useState({}); // { [questionId]: true }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);

  // Timer state
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  // Helper to read current answer
  const getQuestionAnswer = (qId) => {
    if (answers[qId] !== undefined) return answers[qId];
    return persistedAnswers[qId] ?? null;
  };

  const handleAutoSubmitOnExpiry = async () => {
    try {
      setIsSubmitting(true);
      await submitAttemptMutation({ attemptId });
      toast.warning("Time limit expired! Submitting assessment automatically.");
      router.push(`/dashboard/courses/${courseId}/assessments/${assessmentId}/results/${attemptId}`);
    } catch (err) {
      console.error("Auto submit failed:", err);
    }
  };

  // Handle countdown timer for Mock Exam (Requirement 45)
  useEffect(() => {
    if (!attemptData?.assessment?.timeLimitMinutes || !attemptData?.attempt?.startedAt) return;

    const startedAt = attemptData.attempt.startedAt;
    const limitMs = attemptData.assessment.timeLimitMinutes * 60 * 1000;
    const endTimestamp = startedAt + limitMs;

    const updateTimer = () => {
      const now = Date.now();
      const diffSecs = Math.max(0, Math.floor((endTimestamp - now) / 1000));
      setRemainingSeconds(diffSecs);

      if (diffSecs <= 0 && attemptData.attempt.status === "in_progress") {
        handleAutoSubmitOnExpiry();
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [attemptData?.assessment?.timeLimitMinutes, attemptData?.attempt?.startedAt]);

  if (attemptData === undefined) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!attemptData || !attemptData.attempt || !attemptData.assessment) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
        <h2 className="text-xl font-bold">Attempt Session Unavailable</h2>
        <p className="text-muted-foreground">The attempt could not be loaded.</p>
        <Link href={`/dashboard/courses/${courseId}/assessments/${assessmentId}`}>
          <Button variant="outline">Back to Assessment</Button>
        </Link>
      </div>
    );
  }

  const { assessment, attempt, questions } = attemptData;

  // Redirect if already submitted
  if (attempt.status === "graded" || attempt.status === "submitted") {
    router.replace(`/dashboard/courses/${courseId}/assessments/${assessmentId}/results/${attemptId}`);
    return null;
  }

  const currentQ = questions[currentIndex] || questions[0];
  const isPractice = assessment.assessmentType === "practice";

  // Answer handler with debounced / immediate persistence to Convex (Requirement 44)
  const handleAnswerChange = async (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    try {
      await saveResponseMutation({
        attemptId,
        questionId,
        userAnswer: value,
      });
    } catch (err) {
      console.error("Failed to persist answer:", err);
    }
  };

  // Practice Mode: Check Answer handler
  const handleCheckPractice = (questionId) => {
    setPracticeChecked((prev) => ({ ...prev, [questionId]: true }));
  };

  // Count answered questions
  const answeredCount = questions.filter((q) => {
    const a = getQuestionAnswer(q._id);
    if (a === undefined || a === null) return false;
    if (typeof a === "string" && a.trim() === "") return false;
    if (Array.isArray(a) && a.length === 0) return false;
    return true;
  }).length;

  const unansweredCount = questions.length - answeredCount;

  const handlePreSubmit = () => {
    if (unansweredCount > 0) {
      setShowSubmitWarning(true);
    } else {
      handleSubmitFinal(false);
    }
  };

  const handleSubmitFinal = async (force = false) => {
    try {
      setIsSubmitting(true);
      setShowSubmitWarning(false);

      // Objective questions are graded on server; subjective questions can be graded via API if needed
      for (const q of questions) {
        if (q.questionType === "short_answer" || q.questionType === "concept_explanation") {
          const userAns = getQuestionAnswer(q._id);
          if (userAns && typeof userAns === "string" && userAns.trim().length > 0) {
            try {
              const res = await fetch("/api/assessments/grade", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  courseId,
                  questionId: q._id,
                  studentAnswer: userAns,
                  referenceAnswer: q.referenceAnswer,
                  requiredKeyPoints: q.requiredKeyPoints,
                  optionalKeyPoints: q.optionalKeyPoints,
                  misconceptionIndicators: q.misconceptionIndicators,
                  rubric: q.rubric,
                  sourceEvidence: q.sourceEvidence,
                  maxPoints: q.points,
                }),
              });
              if (res.ok) {
                const gradeData = await res.json();
                await saveResponseMutation({
                  attemptId,
                  questionId: q._id,
                  userAnswer: userAns,
                  isCorrect: gradeData.isCorrect,
                  awardedPoints: gradeData.awardedPoints,
                  feedback: gradeData.feedback,
                  matchedKeyPoints: gradeData.matchedKeyPoints,
                  missingKeyPoints: gradeData.missingKeyPoints,
                  incorrectClaims: gradeData.incorrectClaims,
                });
              }
            } catch (gradeErr) {
              console.error("Subjective grading error:", gradeErr);
            }
          }
        }
      }

      await submitAttemptMutation({ attemptId });
      toast.success("Assessment submitted successfully!");
      router.push(`/dashboard/courses/${courseId}/assessments/${assessmentId}/results/${attemptId}`);
    } catch (err) {
      setIsSubmitting(false);
      toast.error(err.message || "Failed to submit assessment");
    }
  };

  // Format timer
  const formatTime = (secs) => {
    if (secs === null) return "--:--";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {assessment.title}
            </span>
            <Badge variant="outline" className="text-xs capitalize">
              {assessment.assessmentType.replace("_", " ")}
            </Badge>
          </div>
          <h2 className="text-xl font-bold mt-0.5">
            Question {currentIndex + 1} of {questions.length}
          </h2>
        </div>

        {/* Timer (For Mock Exam or timed tests) */}
        {remainingSeconds !== null && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono font-bold text-sm ${
              remainingSeconds < 300
                ? "bg-destructive/10 text-destructive border-destructive/30 animate-pulse"
                : "bg-muted text-foreground"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{formatTime(remainingSeconds)}</span>
          </div>
        )}
      </div>

      {/* Question Navigator Pills */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-muted/40 border">
        {questions.map((q, idx) => {
          const isCurrent = idx === currentIndex;
          const a = getQuestionAnswer(q._id);
          const hasAnswered =
            a !== undefined && a !== null && (typeof a === "string" ? a.trim() !== "" : true);

          return (
            <button
              key={q._id}
              onClick={() => setCurrentIndex(idx)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                isCurrent
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/40"
                  : hasAnswered
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-background text-muted-foreground border hover:border-foreground/30"
              }`}
            >
              {idx + 1}
            </button>
          );
        })}

        <div className="ml-auto text-xs text-muted-foreground px-2">
          {answeredCount} of {questions.length} answered
        </div>
      </div>

      {/* Main Question Card */}
      <Card className="shadow-xs border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="capitalize text-xs">
                {currentQ.questionType.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className="capitalize text-xs">
                {currentQ.difficulty}
              </Badge>
              {currentQ.conceptNames?.[0] && (
                <Badge variant="outline" className="text-xs bg-primary/5 text-primary">
                  {currentQ.conceptNames[0]}
                </Badge>
              )}
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {currentQ.points} {currentQ.points === 1 ? "point" : "points"}
            </span>
          </div>

          <CardTitle className="text-lg md:text-xl font-semibold leading-relaxed mt-3">
            {currentQ.questionText}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Visual Asset if attached (Requirement 23, 24, 65) */}
          {(currentQ.sourceVisualUrl || currentQ.sourceVisualId) && (
            <div className="rounded-xl border overflow-hidden bg-muted/20 relative group">
              <img
                src={currentQ.sourceVisualUrl || "/placeholder.png"}
                alt="Question Diagram"
                className="w-full max-h-80 object-contain mx-auto p-2"
              />
              <button
                type="button"
                onClick={() => setZoomImage(currentQ.sourceVisualUrl)}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background shadow-xs text-muted-foreground hover:text-foreground"
                title="Expand diagram"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Input Interface based on questionType */}

          {/* 1. MCQ */}
          {currentQ.questionType === "mcq" && currentQ.options && (
            <div className="space-y-2.5">
              {currentQ.options.map((option, oIdx) => {
                const isSelected = getQuestionAnswer(currentQ._id) === option;
                return (
                  <div
                    key={oIdx}
                    onClick={() => handleAnswerChange(currentQ._id, option)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-border hover:border-primary/40 bg-card"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/40 text-muted-foreground"
                      }`}
                    >
                      {String.fromCharCode(65 + oIdx)}
                    </div>
                    <span className="text-sm font-medium leading-relaxed">{option}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. Multiple Select */}
          {currentQ.questionType === "multiple_select" && currentQ.options && (
            <div className="space-y-2.5">
              <span className="text-xs text-muted-foreground">Select all that apply:</span>
              {currentQ.options.map((option, oIdx) => {
                const currentSet = getQuestionAnswer(currentQ._id) || [];
                const isSelected = currentSet.includes(option);

                const toggleMulti = () => {
                  const next = isSelected
                    ? currentSet.filter((x) => x !== option)
                    : [...currentSet, option];
                  handleAnswerChange(currentQ._id, next);
                };

                return (
                  <div
                    key={oIdx}
                    onClick={toggleMulti}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-border hover:border-primary/40 bg-card"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                    <span className="text-sm font-medium leading-relaxed">{option}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. True / False */}
          {currentQ.questionType === "true_false" && (
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto pt-2">
              {[true, false].map((val) => {
                const isSelected = getQuestionAnswer(currentQ._id) === val;
                return (
                  <Button
                    key={String(val)}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => handleAnswerChange(currentQ._id, val)}
                    className="h-16 text-base font-bold rounded-xl"
                  >
                    {val ? "True" : "False"}
                  </Button>
                );
              })}
            </div>
          )}

          {/* 4. Short Answer & Concept Explanation */}
          {(currentQ.questionType === "short_answer" ||
            currentQ.questionType === "concept_explanation") && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Write your grounded response:
              </Label>
              <Textarea
                rows={5}
                placeholder="Explain based on course material..."
                value={getQuestionAnswer(currentQ._id) || ""}
                onChange={(e) => handleAnswerChange(currentQ._id, e.target.value)}
                className="resize-y text-sm font-normal"
              />
              <p className="text-[11px] text-muted-foreground">
                Responses will be evaluated against course evidence and reference criteria.
              </p>
            </div>
          )}

          {/* 5. Numerical */}
          {currentQ.questionType === "numerical" && (
            <div className="space-y-2 max-w-sm">
              <Label htmlFor="numInput" className="text-xs text-muted-foreground">
                Numerical Answer:
              </Label>
              <Input
                id="numInput"
                type="number"
                step="any"
                placeholder="e.g. 12.5"
                value={getQuestionAnswer(currentQ._id) || ""}
                onChange={(e) => handleAnswerChange(currentQ._id, e.target.value)}
              />
            </div>
          )}

          {/* Practice Mode Instant Feedback (Requirement 52) */}
          {isPractice && (
            <div className="pt-4 border-t space-y-3">
              {!practiceChecked[currentQ._id] ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!getQuestionAnswer(currentQ._id)}
                  onClick={() => handleCheckPractice(currentQ._id)}
                  className="flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Check Answer
                </Button>
              ) : (
                <div className="p-4 rounded-xl border bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2">
                    {/* Basic visual indicator for objective check */}
                    <span className="font-semibold text-sm">Explanation & Evidence</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currentQ.explanation || "Answer grounded in course materials."}
                  </p>
                  {currentQ.sourceEvidence && currentQ.sourceEvidence.length > 0 && (
                    <div className="pt-2 text-xs text-primary font-medium flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        Source: {currentQ.sourceEvidence[0].sourceName} (
                        {currentQ.sourceEvidence[0].pageNumber
                          ? `Page ${currentQ.sourceEvidence[0].pageNumber}`
                          : currentQ.sourceEvidence[0].slideNumber
                          ? `Slide ${currentQ.sourceEvidence[0].slideNumber}`
                          : currentQ.sourceEvidence[0].startTime
                          ? `Video ${currentQ.sourceEvidence[0].startTime}s`
                          : "Document"}
                        )
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Footer Navigation */}
        <CardFooter className="flex justify-between items-center border-t pt-4">
          <Button
            variant="outline"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            className="flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {currentIndex < questions.length - 1 ? (
              <Button
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="flex items-center gap-1.5"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handlePreSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <Send className="w-4 h-4" />
                Submit Assessment
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      {/* Warning Dialog for Unanswered Questions (Requirement 46) */}
      <Dialog open={showSubmitWarning} onOpenChange={setShowSubmitWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unanswered Questions</DialogTitle>
            <DialogDescription>
              You have answered {answeredCount} of {questions.length} questions. {unansweredCount}{" "}
              question(s) remain unanswered. Are you sure you want to submit?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowSubmitWarning(false)}>
              Return to Test
            </Button>
            <Button
              variant="destructive"
              disabled={isSubmitting}
              onClick={() => handleSubmitFinal(true)}
            >
              Submit Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={zoomImage} alt="Diagram" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
