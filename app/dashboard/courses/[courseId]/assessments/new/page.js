"use client";

import { use, useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  HelpCircle,
  FileCheck2,
  BookOpen,
  Shuffle,
  GraduationCap,
  Search,
  Check,
  AlertTriangle,
  Clock,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function NewAssessmentPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;
  const router = useRouter();

  const concepts = useQuery(api.assessments.getCourseConceptsForAssessment, { courseId });
  const createAssessment = useMutation(api.assessments.createAssessment);

  // Form State
  const [assessmentType, setAssessmentType] = useState("topic_quiz");
  const [title, setTitle] = useState("");
  const [conceptSelectionMode, setConceptSelectionMode] = useState("all");
  const [selectedConceptIds, setSelectedConceptIds] = useState([]);
  const [conceptSearch, setConceptSearch] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState("mixed");
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState([
    "mcq",
    "multiple_select",
    "true_false",
    "short_answer",
  ]);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(20);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);

  // Submission & Generation progress
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);

  const generationSteps = [
    "Preparing assessment request...",
    "Selecting course concepts & graph relationships...",
    "Gathering grounded text, visual & video evidence...",
    "Generating candidate questions via Gemini...",
    "Running second-pass answer & distractor validation...",
    "Filtering duplicates & scoring question quality...",
    "Finalizing assessment...",
  ];

  // Filtered concepts
  const filteredConcepts = useMemo(() => {
    if (!concepts) return [];
    if (!conceptSearch.trim()) return concepts;
    const q = conceptSearch.toLowerCase();
    return concepts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [concepts, conceptSearch]);

  const toggleConcept = (id) => {
    setSelectedConceptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleQuestionType = (type) => {
    setSelectedQuestionTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length <= 1) {
          toast.error("At least one question type must be selected.");
          return prev;
        }
        return prev.filter((t) => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const handleSelectAllConcepts = () => {
    if (!concepts) return;
    setSelectedConceptIds(concepts.map((c) => c._id));
  };

  const handleClearConcepts = () => {
    setSelectedConceptIds([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (conceptSelectionMode === "specific" && selectedConceptIds.length === 0) {
      toast.error("Please select at least one concept to assess.");
      return;
    }

    if (selectedQuestionTypes.length === 0) {
      toast.error("Please select at least one question type.");
      return;
    }

    const effectiveTitle =
      title.trim() ||
      (assessmentType === "mock_exam"
        ? "Course Mock Exam"
        : assessmentType === "topic_quiz"
        ? "Concept Topic Quiz"
        : assessmentType === "practice"
        ? "Practice Quiz"
        : "Mixed Course Quiz");

    try {
      setIsSubmitting(true);
      setGenerationStep(0);

      // Step progression animation
      const interval = setInterval(() => {
        setGenerationStep((prev) => (prev < generationSteps.length - 1 ? prev + 1 : prev));
      }, 1800);

      const effectiveConceptIds =
        conceptSelectionMode === "specific"
          ? selectedConceptIds
          : (concepts || []).map((c) => c._id);

      // 1. Create assessment record in Convex with status 'generating'
      const assessmentId = await createAssessment({
        courseId,
        title: effectiveTitle,
        description: `Grounded ${assessmentType.replace("_", " ")} with ${questionCount} questions at ${difficulty} difficulty.`,
        assessmentType,
        selectedConceptIds: effectiveConceptIds,
        difficulty,
        questionCount: Number(questionCount),
        questionTypeConfig: selectedQuestionTypes,
        timeLimitMinutes: assessmentType === "mock_exam" ? Number(timeLimitMinutes) : undefined,
        shuffleQuestions,
        shuffleOptions,
      });

      // 2. Trigger generation endpoint
      const res = await fetch("/api/assessments/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId,
          courseId,
          title: effectiveTitle,
          assessmentType,
          selectedConceptIds: effectiveConceptIds,
          difficulty,
          questionCount: Number(questionCount),
          questionTypeConfig: selectedQuestionTypes,
        }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to trigger assessment generation.");
      }

      toast.success("Assessment generation started!");
      router.push(`/dashboard/courses/${courseId}/assessments/${assessmentId}`);
    } catch (err) {
      setIsSubmitting(false);
      toast.error(err.message || "Failed to create assessment");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8">
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

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Grounded Assessment</h1>
        <p className="text-muted-foreground mt-1">
          Configure an assessment strictly generated and verified against your uploaded course material.
        </p>
      </div>

      {isSubmitting ? (
        <Card className="border-primary/30 p-10 text-center shadow-lg">
          <div className="flex flex-col items-center justify-center space-y-6 max-w-md mx-auto">
            <div className="relative w-16 h-16">
              <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <Sparkles className="w-6 h-6 text-primary absolute inset-0 m-auto" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold">Building Grounded Assessment</h3>
              <p className="text-sm font-medium text-primary animate-pulse">
                {generationSteps[generationStep]}
              </p>
              <p className="text-xs text-muted-foreground">
                Verifying correct answers and eliminating ungrounded distractors...
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 1. Assessment Type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">1. Choose Assessment Type</CardTitle>
              <CardDescription>Select the testing format and learning objective.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Practice Quiz */}
                <div
                  onClick={() => setAssessmentType("practice")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    assessmentType === "practice"
                      ? "border-emerald-500 bg-emerald-500/5 shadow-xs"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <BookOpen className="w-4 h-4 text-emerald-500" />
                    <span className="font-semibold text-sm">Practice Quiz</span>
                    <Badge variant="outline" className="ml-auto text-xs bg-emerald-500/10 text-emerald-600">
                      Learn as you go
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Instant answer verification. Reveals explanations and exact source evidence immediately upon answering each question.
                  </p>
                </div>

                {/* Topic Quiz */}
                <div
                  onClick={() => setAssessmentType("topic_quiz")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    assessmentType === "topic_quiz"
                      ? "border-blue-500 bg-blue-500/5 shadow-xs"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileCheck2 className="w-4 h-4 text-blue-500" />
                    <span className="font-semibold text-sm">Topic Quiz</span>
                    <Badge variant="outline" className="ml-auto text-xs bg-blue-500/10 text-blue-600">
                      Standard
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Targeted assessment focused specifically on selected concepts. Results and grounded evidence reviewed after submission.
                  </p>
                </div>

                {/* Mixed Quiz */}
                <div
                  onClick={() => setAssessmentType("mixed_quiz")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    assessmentType === "mixed_quiz"
                      ? "border-purple-500 bg-purple-500/5 shadow-xs"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Shuffle className="w-4 h-4 text-purple-500" />
                    <span className="font-semibold text-sm">Mixed Quiz</span>
                    <Badge variant="outline" className="ml-auto text-xs bg-purple-500/10 text-purple-600">
                      Multi-topic
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Broad sampling across multiple topics and concept relationship chains to test comprehensive retention.
                  </p>
                </div>

                {/* Mock Exam */}
                <div
                  onClick={() => setAssessmentType("mock_exam")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    assessmentType === "mock_exam"
                      ? "border-amber-500 bg-amber-500/5 shadow-xs"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <GraduationCap className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold text-sm">Mock Exam</span>
                    <Badge variant="outline" className="ml-auto text-xs bg-amber-500/10 text-amber-600">
                      Exam Conditions
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Strict timed examination. Answers and evidence strictly hidden until submission. Auto-submits when timer expires.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. Assessment Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">2. Title & Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Assessment Title (Optional)</Label>
                <Input
                  id="title"
                  placeholder="e.g. Chain Rule & Derivatives Mastery Quiz"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* 3. Concept Selection */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base font-semibold">3. Select Concepts</CardTitle>
                  <CardDescription>
                    Choose which Knowledge Graph concepts should be covered.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={conceptSelectionMode === "all" ? "default" : "outline"}
                    onClick={() => setConceptSelectionMode("all")}
                  >
                    All Concepts ({concepts?.length ?? 0})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={conceptSelectionMode === "specific" ? "default" : "outline"}
                    onClick={() => setConceptSelectionMode("specific")}
                  >
                    Specific ({selectedConceptIds.length})
                  </Button>
                </div>
              </div>
            </CardHeader>

            {conceptSelectionMode === "specific" && (
              <CardContent className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      placeholder="Search concepts..."
                      className="pl-9 text-sm"
                      value={conceptSearch}
                      onChange={(e) => setConceptSearch(e.target.value)}
                    />
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={handleSelectAllConcepts}>
                    Select All
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={handleClearConcepts}>
                    Clear
                  </Button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 border rounded-lg p-3 divide-y">
                  {filteredConcepts.map((c) => {
                    const isSelected = selectedConceptIds.includes(c._id);
                    return (
                      <div
                        key={c._id}
                        onClick={() => toggleConcept(c._id)}
                        className={`pt-2 first:pt-0 flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{c.name}</span>
                            {c.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">
                            {c.importance || "core"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {c.sourceCount || 1} sources
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredConcepts.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      No concepts found matching your search.
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* 4. Question Count & Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Question Count */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">4. Number of Questions</CardTitle>
                <CardDescription>Target question count for this assessment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 15, 20].map((num) => (
                    <Button
                      key={num}
                      type="button"
                      variant={questionCount === num ? "default" : "outline"}
                      onClick={() => setQuestionCount(num)}
                      className="w-full"
                    >
                      {num}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Label htmlFor="customCount" className="text-xs text-muted-foreground whitespace-nowrap">
                    Custom Count:
                  </Label>
                  <Input
                    id="customCount"
                    type="number"
                    min={1}
                    max={50}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 text-sm"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Difficulty */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">5. Difficulty Level</CardTitle>
                <CardDescription>Cognitive depth of questions generated.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "easy", name: "Easy", desc: "Recall & definitions" },
                    { id: "medium", name: "Medium", desc: "Application & relationships" },
                    { id: "hard", name: "Hard", desc: "Synthesis & multi-step" },
                    { id: "mixed", name: "Mixed (Recommended)", desc: "Balanced distribution" },
                  ].map((d) => (
                    <div
                      key={d.id}
                      onClick={() => setDifficulty(d.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        difficulty === d.id
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className="font-semibold text-xs">{d.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{d.desc}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 6. Question Types */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">6. Question Types</CardTitle>
              <CardDescription>Select the question types you want to include.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { id: "mcq", label: "Multiple Choice (MCQ)", desc: "1 correct, 3 distractors" },
                  { id: "multiple_select", label: "Multiple Select", desc: "Select all that apply" },
                  { id: "true_false", label: "True / False", desc: "Conceptual statements" },
                  { id: "short_answer", label: "Short Answer", desc: "Grounded rubric check" },
                  { id: "concept_explanation", label: "Concept Explanation", desc: "Detailed mechanisms" },
                  { id: "numerical", label: "Numerical", desc: "If numbers are present" },
                ].map((type) => {
                  const isChecked = selectedQuestionTypes.includes(type.id);
                  return (
                    <div
                      key={type.id}
                      onClick={() => toggleQuestionType(type.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                        isChecked
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-sm border mt-0.5 flex items-center justify-center shrink-0 ${
                          isChecked
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground"
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold">{type.label}</div>
                        <div className="text-[10px] text-muted-foreground">{type.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 7. Mock Exam Settings (Conditional) */}
          {assessmentType === "mock_exam" && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <CardTitle className="text-base font-semibold">Mock Exam Settings</CardTitle>
                </div>
                <CardDescription>
                  Configure strict exam constraints and time limits.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="space-y-1.5 flex-1">
                    <Label htmlFor="timelimit" className="text-xs font-semibold">
                      Time Limit (Minutes)
                    </Label>
                    <Input
                      id="timelimit"
                      type="number"
                      min={5}
                      max={180}
                      value={timeLimitMinutes}
                      onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                      className="max-w-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-2 pt-4">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shuffleQuestions}
                        onChange={(e) => setShuffleQuestions(e.target.checked)}
                        className="rounded border-muted-foreground"
                      />
                      <span>Shuffle questions order</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shuffleOptions}
                        onChange={(e) => setShuffleOptions(e.target.checked)}
                        className="rounded border-muted-foreground"
                      />
                      <span>Shuffle multiple-choice options</span>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit CTA */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Link href={`/dashboard/courses/${courseId}/assessments`}>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" size="lg" className="flex items-center gap-2 shadow-sm">
              <Sparkles className="w-4 h-4" />
              Generate Assessment
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
