"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import {
  FileCheck2,
  Plus,
  Play,
  Clock,
  Award,
  Layers,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Trash2,
  BarChart3,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function AssessmentsPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;

  const assessments = useQuery(api.assessments.getCourseAssessments, { courseId });
  const metrics = useQuery(api.assessments.getCourseAssessmentMetrics, { courseId });
  const deleteAssessment = useMutation(api.assessments.deleteAssessment);

  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (e, assessmentId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this assessment and its attempt history?")) return;

    try {
      setDeletingId(assessmentId);
      await deleteAssessment({ assessmentId });
      toast.success("Assessment deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete assessment");
    } finally {
      setDeletingId(null);
    }
  };

  if (assessments === undefined || metrics === undefined) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const getTypeBadge = (type) => {
    switch (type) {
      case "practice":
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Practice Quiz</Badge>;
      case "topic_quiz":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">Topic Quiz</Badge>;
      case "mixed_quiz":
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">Mixed Quiz</Badge>;
      case "mock_exam":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">Mock Exam</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getDifficultyBadge = (diff) => {
    switch (diff) {
      case "easy":
        return <Badge variant="secondary" className="text-xs">Easy</Badge>;
      case "medium":
        return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      case "hard":
        return <Badge variant="secondary" className="text-xs">Hard</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Mixed</Badge>;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "ready":
        return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs">Ready</Badge>;
      case "generating":
        return (
          <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-xs flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Generating
          </Badge>
        );
      case "draft":
        return <Badge variant="outline" className="text-xs">Draft</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Course Assessments</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Generate and take rigorous assessments grounded strictly in your course materials.
          </p>
        </div>
        <Link href={`/dashboard/courses/${courseId}/assessments/new`}>
          <Button className="flex items-center gap-2 shadow-sm">
            <Plus className="w-4 h-4" />
            Create Assessment
          </Button>
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Assessments</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalAssessments ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Configured tests</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Questions Generated</CardTitle>
            <Sparkles className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalQuestionsGenerated ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Grounded questions</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Completed Attempts</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.completedAttemptsCount ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Graded submissions</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Average Score</CardTitle>
            <Award className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.averagePercentage !== null ? `${metrics.averagePercentage}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across all attempts</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="assessments" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="assessments" className="flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4" />
            Assessments ({assessments.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            History ({metrics?.completedAttemptsCount ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab Content: Assessments Grid */}
        <TabsContent value="assessments">
          {assessments.length === 0 ? (
            <Card className="border-dashed p-12 text-center">
              <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileCheck2 className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold">Test your understanding</h3>
                  <p className="text-sm text-muted-foreground">
                    Create grounded assessments directly from your course concepts and uploaded material.
                  </p>
                </div>
                <Link href={`/dashboard/courses/${courseId}/assessments/new`}>
                  <Button className="mt-2 flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create Assessment
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {assessments.map((ass) => {
                const isReady = ass.status === "ready";
                const isGenerating = ass.status === "generating";

                return (
                  <Card key={ass._id} className="flex flex-col justify-between hover:border-primary/40 transition-all shadow-xs">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-2">
                        {getTypeBadge(ass.assessmentType)}
                        <div className="flex items-center gap-1.5">
                          {getDifficultyBadge(ass.difficulty)}
                          {getStatusBadge(ass.status)}
                        </div>
                      </div>
                      <CardTitle className="text-lg font-semibold mt-2 line-clamp-1">{ass.title}</CardTitle>
                      <CardDescription className="text-xs line-clamp-2">
                        {ass.description || `${ass.generatedQuestionCount || ass.questionCount} grounded questions`}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="py-2 text-sm space-y-2 border-t border-b bg-muted/20">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Questions:</span>
                        <span className="font-medium text-foreground">
                          {ass.generatedQuestionCount || ass.questionCount}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Best Score:</span>
                        <span className="font-semibold text-foreground">
                          {ass.bestPercentage !== null ? `${ass.bestPercentage}%` : "No attempts yet"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Attempts:</span>
                        <span className="font-medium text-foreground">{ass.attemptCount} completed</span>
                      </div>
                      {ass.timeLimitMinutes && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Time Limit:</span>
                          <span className="font-medium text-foreground">{ass.timeLimitMinutes} mins</span>
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="pt-3 flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === ass._id}
                        onClick={(e) => handleDelete(e, ass._id)}
                        className="text-muted-foreground hover:text-destructive px-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>

                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/courses/${courseId}/assessments/${ass._id}`}>
                          <Button variant="outline" size="sm">
                            Details
                          </Button>
                        </Link>

                        {isReady && (
                          <Link href={`/dashboard/courses/${courseId}/assessments/${ass._id}`}>
                            <Button size="sm" className="flex items-center gap-1.5">
                              <Play className="w-3.5 h-3.5" />
                              Start
                            </Button>
                          </Link>
                        )}
                        {isGenerating && (
                          <Button size="sm" disabled variant="secondary" className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                            Building...
                          </Button>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab Content: History List */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Attempt History</CardTitle>
              <CardDescription>Review performance on all previous assessment attempts.</CardDescription>
            </CardHeader>
            <CardContent>
              {assessments.flatMap((a) => a.attempts || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No completed attempts recorded yet. Start an assessment to test your understanding!
                </div>
              ) : (
                <div className="divide-y">
                  {assessments.map((ass) => (
                    <div key={ass._id} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{ass.title}</span>
                          {getTypeBadge(ass.assessmentType)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                          <span>{ass.attemptCount} completed attempt(s)</span>
                          <span>·</span>
                          <span>Best: {ass.bestPercentage !== null ? `${ass.bestPercentage}%` : "—"}</span>
                        </div>
                      </div>
                      <Link href={`/dashboard/courses/${courseId}/assessments/${ass._id}`}>
                        <Button variant="outline" size="sm">
                          View Details & Retake
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
