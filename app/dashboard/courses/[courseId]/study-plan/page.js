"use client";

import { useState, useMemo, use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CalendarCheck,
  Clock,
  RotateCcw,
  Sparkles,
  Target,
  BookOpen,
  FileCheck2,
  AlertTriangle,
  Layers,
  ChevronRight,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { GeneratePlanDialog } from "@/components/study-plan/generate-plan-dialog";
import { StudyItemCard } from "@/components/study-plan/study-item-card";
import { RecommendationCard } from "@/components/study-plan/recommendation-card";

export default function StudyPlanPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;

  const todayDateStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Convex Queries
  const overview = useQuery(api.studyIntelligence.getStudyOverview, { courseId, todayDate: todayDateStr });
  const todayPlanData = useQuery(api.studyIntelligence.getTodayStudyPlan, { courseId, todayDate: todayDateStr });
  const recommendations = useQuery(api.studyIntelligence.getStudyRecommendations, { courseId, status: "active" });
  const dueReviews = useQuery(api.studyIntelligence.getDueReviews, { courseId });
  const concepts = useQuery(api.knowledgeGraph.getCourseKnowledgeGraph, { courseId });

  // Mutations
  const recomputeMutation = useMutation(api.studyIntelligence.recomputeStudyRecommendations);
  const rebalanceMutation = useMutation(api.studyIntelligence.rebalanceStudyPlan);

  const [activeTab, setActiveTab] = useState("today");
  const [recFilter, setRecFilter] = useState("all");
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleRecompute = async () => {
    try {
      setIsRecomputing(true);
      toast.info("Recalculating personal study recommendations from learner model...");
      const res = await recomputeMutation({ courseId });
      toast.success(
        `Recommendations updated! Evaluated ${res.count} concepts (${res.criticalCount} critical, ${res.highCount} high).`
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to recompute study recommendations.");
    } finally {
      setIsRecomputing(false);
    }
  };

  const handleRebalance = async () => {
    if (!todayPlanData?.plan?._id) return;
    try {
      setIsRebalancing(true);
      const res = await rebalanceMutation({
        studyPlanId: todayPlanData.plan._id,
        todayDate: todayDateStr,
      });
      toast.success(`Plan rebalanced! Moved ${res.rebalancedCount} missed item(s) to today.`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to rebalance study plan.");
    } finally {
      setIsRebalancing(false);
    }
  };

  // Filter recommendations
  const filteredRecs = useMemo(() => {
    if (!recommendations) return [];
    if (recFilter === "critical_high") {
      return recommendations.filter((r) => r.priorityBand === "critical" || r.priorityBand === "high");
    }
    if (recFilter === "due_review") {
      return recommendations.filter((r) => r.reasonCodes?.includes("DUE_FOR_REVIEW") || r.recommendationType === "spaced_review");
    }
    if (recFilter === "prerequisites") {
      return recommendations.filter((r) => r.reasonCodes?.includes("PREREQUISITE_BLOCKER") || r.recommendationType === "remediate_prerequisite");
    }
    if (recFilter === "misconceptions") {
      return recommendations.filter((r) => r.reasonCodes?.includes("ACTIVE_MISCONCEPTION") || r.recommendationType === "address_misconception");
    }
    if (recFilter === "not_assessed") {
      return recommendations.filter((r) => r.reasonCodes?.includes("NOT_ASSESSED"));
    }
    return recommendations;
  }, [recommendations, recFilter]);

  if (overview === undefined || recommendations === undefined) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const activePlan = overview?.activePlan;
  const examTargetDate = activePlan?.targetDate;
  let daysToExam = null;
  if (examTargetDate) {
    const examMs = new Date(examTargetDate).getTime();
    const nowMs = new Date(todayDateStr).getTime();
    daysToExam = Math.max(0, Math.ceil((examMs - nowMs) / (24 * 60 * 60 * 1000)));
  }

  const todayItems = todayPlanData?.items || [];
  const completedTodayCount = todayItems.filter((i) => i.status === "completed").length;

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Personal Study Intelligence</h1>
            <Badge variant="outline" className="text-xs uppercase font-semibold text-primary border-primary/30">
              V10
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Explainable study priorities, prerequisite remediation, spaced reviews, and personalized daily schedules.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecompute}
            disabled={isRecomputing}
            className="text-xs gap-1.5 h-9"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRecomputing ? "animate-spin" : ""}`} />
            {isRecomputing ? "Recalculating..." : "Recalculate Priorities"}
          </Button>

          <Button
            size="sm"
            onClick={() => setIsPlanDialogOpen(true)}
            className="text-xs gap-1.5 h-9"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            {activePlan ? "Adjust Plan" : "Generate Study Plan"}
          </Button>
        </div>
      </div>

      {/* Overview Metric Cards (Section 41) */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Today's Study */}
        <Card className="rounded-2xl border bg-card shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Today&apos;s Study
            </CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {overview.todayMinutes} <span className="text-sm font-normal text-muted-foreground">min</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {completedTodayCount} of {todayItems.length} activities completed
            </p>
          </CardContent>
        </Card>

        {/* Due Reviews */}
        <Card className="rounded-2xl border bg-card shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Due Reviews
            </CardTitle>
            <RotateCcw className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{overview.dueReviewsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Concepts due for scheduled spaced review
            </p>
          </CardContent>
        </Card>

        {/* High Priority Concepts */}
        <Card className="rounded-2xl border bg-card shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              High Priority
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{overview.highPriorityCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Weak topics or prerequisite blockers
            </p>
          </CardContent>
        </Card>

        {/* Exam Countdown / Exam Readiness (Section 61 & 62) */}
        {examTargetDate ? (
          <Card className="rounded-2xl border bg-card shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Target Exam
              </CardTitle>
              <Target className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {daysToExam} <span className="text-sm font-normal text-muted-foreground">days</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-muted-foreground">Readiness:</span>
                <Badge variant="outline" className="text-[10px] uppercase font-bold py-0 px-1 capitalize">
                  {(activePlan.examReadiness || "developing").replace(/_/g, " ")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border bg-card shadow-2xs border-dashed flex flex-col justify-between">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Target Exam
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">No exam date configured</p>
              <button
                type="button"
                onClick={() => setIsPlanDialogOpen(true)}
                className="text-xs text-primary hover:underline font-semibold mt-1 inline-block"
              >
                Set exam date →
              </button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 max-w-md">
          <TabsTrigger value="today" className="text-xs font-medium">
            Today&apos;s Plan ({todayItems.length})
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs font-medium">
            Recommendations ({recommendations.length})
          </TabsTrigger>
          <TabsTrigger value="spaced_review" className="text-xs font-medium">
            Spaced Queue ({dueReviews?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Today's Plan */}
        <TabsContent value="today" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {activePlan ? activePlan.title : "Today\u2019s Study Focus"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {activePlan
                  ? `Targeting ${activePlan.dailyMinutes} minutes of focused study based on your real learner model.`
                  : "Generate a study plan to structure your daily learning activities."}
              </p>
            </div>

            {activePlan && todayItems.some((it) => it.date < todayDateStr && it.status === "pending") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRebalance}
                disabled={isRebalancing}
                className="text-xs h-8 gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Rebalance Missed Items
              </Button>
            )}
          </div>

          {todayItems.length > 0 ? (
            <div className="space-y-3">
              {todayItems.map((item) => (
                <StudyItemCard
                  key={item._id}
                  item={item}
                  courseId={courseId}
                />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center border-dashed rounded-2xl">
              <CalendarCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-60" />
              <h3 className="font-semibold text-base mb-1">No study items scheduled for today</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
                Click below to generate a tailored daily or weekly study plan based on your course knowledge graph and assessment results.
              </p>
              <Button size="sm" onClick={() => setIsPlanDialogOpen(true)}>
                Generate Today&apos;s Plan
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2: All Recommendations */}
        <TabsContent value="recommendations" className="space-y-4">
          {/* Sub-filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b">
            {[
              { id: "all", label: `All (${recommendations.length})` },
              { id: "critical_high", label: `Critical & High (${overview.highPriorityCount})` },
              { id: "due_review", label: `Due for Review (${overview.dueReviewsCount})` },
              { id: "prerequisites", label: "Prerequisites" },
              { id: "misconceptions", label: "Misconceptions" },
              { id: "not_assessed", label: "Not Assessed" },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setRecFilter(chip.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  recFilter === chip.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {filteredRecs.length > 0 ? (
            <div className="space-y-3">
              {filteredRecs.map((rec) => (
                <RecommendationCard
                  key={rec._id}
                  recommendation={rec}
                  courseId={courseId}
                />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center border-dashed rounded-2xl">
              <p className="text-xs text-muted-foreground">No recommendations match the selected filter.</p>
            </Card>
          )}
        </TabsContent>

        {/* Tab 3: Spaced Review Queue */}
        <TabsContent value="spaced_review" className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Spaced Review Retention Queue</h2>
            <p className="text-xs text-muted-foreground">
              Review intervals automatically expand with successful recall (1d → 3d → 7d → 14d → 30d) and shorten after assessment errors.
            </p>
          </div>

          {dueReviews && dueReviews.length > 0 ? (
            <div className="space-y-3">
              {dueReviews.map((rev) => {
                const concept = (concepts?.concepts || []).find((c) => String(c._id) === String(rev.conceptId));
                return (
                  <div
                    key={rev._id}
                    className="p-4 rounded-xl border bg-card flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-sm text-foreground">
                        {concept?.name || "Concept Review"}
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        Interval: {rev.reviewIntervalDays} day{rev.reviewIntervalDays === 1 ? "" : "s"} • {rev.successfulReviews || 0} successful recall{rev.successfulReviews === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Link href={`/dashboard/courses/${courseId}/tutor?initialQuestion=${encodeURIComponent(`Quick review of ${concept?.name || "this concept"}`)}&focusConceptId=${rev.conceptId}`}>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                        Review Now <ChevronRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card className="p-8 text-center border-dashed rounded-2xl">
              <RotateCcw className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <h3 className="font-semibold text-sm mb-1">All spaced reviews are up to date!</h3>
              <p className="text-xs text-muted-foreground">
                Concepts will reappear here as their retention intervals mature.
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Development Diagnostics Collapsible Card (Section 74) */}
      <div className="pt-4 border-t">
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
          {showDiagnostics ? "Hide Study Intelligence Diagnostics" : "View Priority Formula & Diagnostics (V10)"}
        </button>

        {showDiagnostics && (
          <Card className="mt-3 p-4 rounded-xl bg-muted/30 border text-xs space-y-3 font-mono">
            <div className="font-bold text-foreground text-sm font-sans">
              Personal Study Intelligence Architecture (V10)
            </div>
            <div className="space-y-1 text-muted-foreground">
              <div>• Priority Formula: Priority = MasteryNeed (40) + PrerequisiteBlocker (20) + RecentErrors (15) + Misconception (15) + ReviewDue (20) + Importance (10) + ExamRelevance (15)</div>
              <div>• Score Scale: 0 to 100 [Critical: &gt;=75, High: &gt;=50, Medium: &gt;=25, Low: &lt;25]</div>
              <div>• Review Intervals: Needs Attention (1d) → Developing (3d) → Proficient (7d) → Strong (14d) → Retention (30d)</div>
              <div>• Core Invariant: Study Item completion logs activity events, but persistent mastery is ONLY updated by graded assessments.</div>
            </div>
          </Card>
        )}
      </div>

      {/* Plan Generation Dialog */}
      <GeneratePlanDialog
        courseId={courseId}
        open={isPlanDialogOpen}
        onOpenChange={setIsPlanDialogOpen}
        onPlanGenerated={() => {
          setActiveTab("today");
        }}
      />
    </div>
  );
}
