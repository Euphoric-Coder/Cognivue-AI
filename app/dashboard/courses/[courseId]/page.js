"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Library,
  Network,
  Target,
  MessageSquare,
  CheckCircle2,
  Circle,
  Image as ImageIcon,
  FileCheck2,
  CalendarCheck,
  TrendingUp,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Loader2,
  Flame,
  ShieldCheck
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function CourseOverviewPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;
  const course = useQuery(api.courses.getCourseById, { courseId });
  const sources = useQuery(api.sources.getCourseSources, { courseId });
  const visualMetrics = useQuery(api.sources.getCourseVisualMetrics, { courseId });
  const graphMetrics = useQuery(api.knowledgeGraph.getCourseGraphMetrics, { courseId });
  const assessmentMetrics = useQuery(api.assessments.getCourseAssessmentMetrics, { courseId });
  const learnerSummary = useQuery(api.learnerModel.getCourseLearnerSummary, { courseId });
  const resetDemo = useMutation(api.demo.resetDemoCourse);

  const [isResettingDemo, setIsResettingDemo] = useState(false);

  const handleResetDemo = async () => {
    if (confirm("Reset demo course back to initial state? This re-seeds all sample sources, knowledge graph, assessments, and study recommendations.")) {
      try {
        setIsResettingDemo(true);
        await resetDemo({});
        toast.success("Demo course reset to initial state!");
      } catch (e) {
        console.error("Failed to reset demo:", e);
        toast.error("Failed to reset demo course.");
      } finally {
        setIsResettingDemo(false);
      }
    }
  };

  if (course === undefined || sources === undefined) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto py-4">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto text-center py-16">
        <h2 className="text-xl font-semibold">Course not found</h2>
        <p className="text-muted-foreground mt-1">The course does not exist or you do not have permission to access it.</p>
        <Link href="/dashboard" className="mt-4 inline-block">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const hasSources = (sources || []).length > 0;
  const processedSourcesCount = (sources || []).filter((s) => s.status === "ready").length;
  const totalChunks = (sources || []).reduce((acc, s) => acc + (s.chunkCount || 0), 0);
  const ragReadyCount = (sources || []).filter((s) => s.ragStatus === "ready").length;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Demo Course Header Banner */}
      {course.isDemo && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-primary/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-400 font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-3 h-3 mr-1" />
                Hackathon Demo Course
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">MATH-CS-301</span>
            </div>
            <p className="text-xs sm:text-sm text-foreground/80 max-w-2xl">
              Pre-loaded with multimodal materials (PDF notes, PPTX slides, timestamped MP4 video, knowledge graph, 5-question diagnostic assessment, and active learner state).
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetDemo}
            disabled={isResettingDemo}
            className="border-amber-500/40 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0"
          >
            {isResettingDemo ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Reset Demo Data
              </>
            )}
          </Button>
        </div>
      )}

      {/* Course Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{course.name}</h2>
            {course.courseCode && <Badge variant="secondary">{course.courseCode}</Badge>}
          </div>
          <p className="text-muted-foreground mt-1 text-sm max-w-3xl">
            {course.description || "Course workspace for multimodal grounding, tutoring, assessments, and study planning."}
          </p>
        </div>
      </div>

      {/* Quick Launchpad Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href={`/dashboard/courses/${courseId}/tutor`}>
          <div className="p-4 rounded-xl bg-card border border-border/60 hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between h-24 group">
            <div className="flex items-center justify-between">
              <MessageSquare className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Ask AI Tutor</div>
              <div className="text-[11px] text-muted-foreground">Source-grounded RAG</div>
            </div>
          </div>
        </Link>

        <Link href={`/dashboard/courses/${courseId}/assessments`}>
          <div className="p-4 rounded-xl bg-card border border-border/60 hover:border-emerald-500/50 hover:shadow-md transition-all flex flex-col justify-between h-24 group">
            <div className="flex items-center justify-between">
              <FileCheck2 className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Assessments</div>
              <div className="text-[11px] text-muted-foreground">Grounded quizzes & grading</div>
            </div>
          </div>
        </Link>

        <Link href={`/dashboard/courses/${courseId}/knowledge-map`}>
          <div className="p-4 rounded-xl bg-card border border-border/60 hover:border-blue-500/50 hover:shadow-md transition-all flex flex-col justify-between h-24 group">
            <div className="flex items-center justify-between">
              <Network className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Knowledge Map</div>
              <div className="text-[11px] text-muted-foreground">Graph & prerequisites</div>
            </div>
          </div>
        </Link>

        <Link href={`/dashboard/courses/${courseId}/study-plan`}>
          <div className="p-4 rounded-xl bg-card border border-border/60 hover:border-purple-500/50 hover:shadow-md transition-all flex flex-col justify-between h-24 group">
            <div className="flex items-center justify-between">
              <CalendarCheck className="w-5 h-5 text-purple-500 group-hover:scale-110 transition-transform" />
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-purple-500 transition-colors" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">Study Plan</div>
              <div className="text-[11px] text-muted-foreground">Daily focus & review</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <Card className="bg-card/70 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sources
            </CardTitle>
            <Library className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sources.length}</div>
            <Link
              href={`/dashboard/courses/${courseId}/sources`}
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              Manage materials →
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Visuals Analyzed
            </CardTitle>
            <ImageIcon className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{visualMetrics?.totalVisuals ?? (course.isDemo ? 3 : 0)}</div>
            <p className="text-xs text-muted-foreground line-clamp-1">Charts, tables & keyframes</p>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Knowledge Map
            </CardTitle>
            <Network className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{graphMetrics?.conceptCount ?? (course.isDemo ? 7 : 0)}</div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {graphMetrics && graphMetrics.conceptCount > 0
                ? `${graphMetrics.relationshipCount} links · ${graphMetrics.prerequisiteCount} prerequisites`
                : course.isDemo
                ? "3 links · 2 prerequisites"
                : "Concepts & prerequisite graph"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/70 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Learner Mastery
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {learnerSummary?.overallMastery !== undefined
                ? `${learnerSummary.overallMastery}%`
                : course.isDemo
                ? "59%"
                : "—"}
            </div>
            <Link
              href={`/dashboard/courses/${courseId}/progress`}
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              View progress & trends →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Main Two-Column Status Area */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* System Capabilities Readiness Checklist */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Workspace Pipeline Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold leading-none">Course Workspace Active</p>
                <p className="text-xs text-muted-foreground">Workspace and security boundaries initialized.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {hasSources ? (
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="space-y-0.5">
                <p className="text-sm font-semibold leading-none">Learning Materials Ingested</p>
                <p className="text-xs text-muted-foreground">
                  {hasSources
                    ? `${sources.length} sources with ${totalChunks} text & visual chunks ready.`
                    : "Add PDFs, slides, and videos to begin."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {ragReadyCount > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="space-y-0.5">
                <p className="text-sm font-semibold leading-none">Grounded AI Tutor RAG</p>
                <p className="text-xs text-muted-foreground">
                  {ragReadyCount > 0
                    ? `${ragReadyCount} sources indexed with Gemini embeddings.`
                    : "Processes as soon as materials are uploaded."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {(graphMetrics?.conceptCount ?? 0) > 0 || course.isDemo ? (
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="space-y-0.5">
                <p className="text-sm font-semibold leading-none">Course Knowledge Graph</p>
                <p className="text-xs text-muted-foreground">
                  {(graphMetrics?.conceptCount ?? 0) > 0 || course.isDemo
                    ? "Concepts extracted with prerequisite relationships."
                    : "Extract concepts from your source materials."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {(assessmentMetrics?.totalAssessments ?? 0) > 0 || course.isDemo ? (
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="space-y-0.5">
                <p className="text-sm font-semibold leading-none">Diagnostic Assessments</p>
                <p className="text-xs text-muted-foreground">
                  {(assessmentMetrics?.totalAssessments ?? 0) > 0 || course.isDemo
                    ? "Grounded questions ready with instant rubric grading."
                    : "Generate your first assessment from the Knowledge Map."}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {course.isDemo || learnerSummary?.totalConcepts ? (
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="space-y-0.5">
                <p className="text-sm font-semibold leading-none">Personal Study Intelligence</p>
                <p className="text-xs text-muted-foreground">
                  {course.isDemo || learnerSummary?.totalConcepts
                    ? "Daily study priorities, spaced review, and remediation active."
                    : "Unlocks after taking your first diagnostic test."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Materials */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold">Course Materials</CardTitle>
            <Link href={`/dashboard/courses/${courseId}/sources`}>
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-4">No sources uploaded yet.</p>
                <Link href={`/dashboard/courses/${courseId}/sources`}>
                  <Button variant="secondary" size="sm">
                    Add Materials
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {sources.slice(0, 4).map((source) => (
                  <div
                    key={source._id}
                    className="flex items-center justify-between border-b border-border/40 last:border-0 pb-2.5 last:pb-0"
                  >
                    <div className="space-y-0.5 overflow-hidden pr-2">
                      <p className="text-sm font-medium leading-none truncate">{source.name}</p>
                      <div className="flex items-center text-xs text-muted-foreground gap-2">
                        <span className="uppercase font-mono text-[10px] bg-muted px-1 rounded">
                          {source.type}
                        </span>
                        <span>•</span>
                        <span>{(source.size / (1024 * 1024)).toFixed(1)} MB</span>
                        {source.chunkCount ? (
                          <>
                            <span>•</span>
                            <span>{source.chunkCount} chunks</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[11px] capitalize shrink-0">
                      {source.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
