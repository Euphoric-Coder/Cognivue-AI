"use client";

import { use, useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Target,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Network,
  Clock,
  Compass
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import { ConceptProgressDrawer } from "@/components/learner-model/concept-progress-drawer";
import { CourseTrendChart } from "@/components/learner-model/course-trend-chart";

export default function ProgressPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;

  const summary = useQuery(api.learnerModel.getCourseLearnerSummary, { courseId });
  const conceptStates = useQuery(api.learnerModel.getCourseConceptStates, { courseId });
  const course = useQuery(api.courses.getCourseById, { courseId });

  const recomputeModel = useMutation(api.learnerModel.recomputeCourseLearnerModel);

  const [searchQuery, setSearchQuery] = useState("");
  const [bandFilter, setBandFilter] = useState("all");
  const [coreOnly, setCoreOnly] = useState(false);
  const [sortBy, setSortBy] = useState("mastery_desc");
  const [selectedConceptId, setSelectedConceptId] = useState(null);
  const [isRecomputing, setIsRecomputing] = useState(false);

  // Filtered & Sorted concepts
  const filteredConcepts = useMemo(() => {
    if (!conceptStates) return [];

    return conceptStates
      .filter((c) => {
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesName = c.conceptName.toLowerCase().includes(q);
          const matchesType = (c.conceptType || "").toLowerCase().includes(q);
          if (!matchesName && !matchesType) return false;
        }

        // Core filter
        if (coreOnly && c.importance !== "core") return false;

        // Band filter
        if (bandFilter === "all") return true;
        if (bandFilter === "not_assessed") return c.evidenceCount === 0 || c.masteryBand === "insufficient_evidence";
        return c.masteryBand === bandFilter;
      })
      .sort((a, b) => {
        if (sortBy === "mastery_desc") {
          return b.masteryProbability - a.masteryProbability;
        } else if (sortBy === "mastery_asc") {
          return a.masteryProbability - b.masteryProbability;
        } else if (sortBy === "evidence_desc") {
          return b.evidenceCount - a.evidenceCount;
        } else if (sortBy === "name_asc") {
          return a.conceptName.localeCompare(b.conceptName);
        }
        return 0;
      });
  }, [conceptStates, searchQuery, bandFilter, coreOnly, sortBy]);

  const handleRecompute = async () => {
    try {
      setIsRecomputing(true);
      toast.info("Recomputing learner model from graded assessment evidence...");
      const res = await recomputeModel({ courseId });
      toast.success(
        `Learner model updated! Processed ${res.attemptsProcessed} graded attempt${res.attemptsProcessed === 1 ? "" : "s"}.`
      );
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to recompute learner model");
    } finally {
      setIsRecomputing(false);
    }
  };

  const getBandBadge = (band, evidenceCount) => {
    if (!evidenceCount || band === "insufficient_evidence") {
      return <Badge variant="outline" className="text-muted-foreground border-dashed text-[10px]">Not Assessed</Badge>;
    }
    switch (band) {
      case "strong":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px]">Strong</Badge>;
      case "proficient":
        return <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[10px]">Proficient</Badge>;
      case "developing":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[10px]">Developing</Badge>;
      case "needs_attention":
        return <Badge variant="destructive" className="font-semibold text-[10px]">Needs Attention</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground text-[10px]">Not Assessed</Badge>;
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

  const getConfidenceBadge = (confidence, evidenceCount) => {
    if (!evidenceCount || confidence === "insufficient") {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    switch (confidence) {
      case "high":
        return <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/40 text-[10px]">High</Badge>;
      case "medium":
        return <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-500/40 text-[10px]">Medium</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground border-dashed text-[10px]">Low / Prov.</Badge>;
    }
  };

  if (summary === undefined || conceptStates === undefined) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const bands = summary?.bands || { strong: 0, proficient: 0, developing: 0, needsAttention: 0, notAssessed: 0 };
  const totalConcepts = summary?.totalConceptCount || 0;
  const observedCount = summary?.observedConceptCount || 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Learning Progress</h2>
            <Badge variant="outline" className="text-primary border-primary/30 font-semibold text-xs">V8 Knowledge Tracing</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Persistent, evidence-based model of your understanding across course concepts.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/dashboard/courses/${courseId}/knowledge-map`}>
            <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl">
              <Network className="w-3.5 h-3.5 mr-1.5" />
              Knowledge Map
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs rounded-xl"
            onClick={handleRecompute}
            disabled={isRecomputing}
            title="Idempotently recalculates concept mastery from all historical graded responses"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRecomputing ? "animate-spin" : ""}`} />
            Sync Model
          </Button>
        </div>
      </div>

      {/* 4 Core Metric Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Course Mastery */}
        <Card className="rounded-2xl shadow-xs border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Course Mastery</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl md:text-4xl font-black tracking-tight text-primary">
              {summary.observedConceptCount > 0 ? `${summary.overallMastery}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Importance-weighted understanding of assessed concepts
            </p>
          </CardContent>
        </Card>

        {/* Assessment Coverage */}
        <Card className="rounded-2xl shadow-xs border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Coverage</CardTitle>
            <Compass className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl md:text-4xl font-black tracking-tight text-blue-600 dark:text-blue-400">
              {summary.coverage}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <strong>{observedCount}</strong> of <strong>{totalConcepts}</strong> course concepts assessed
            </p>
          </CardContent>
        </Card>

        {/* Model Confidence */}
        <Card className="rounded-2xl shadow-xs border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Model Confidence</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-black tracking-tight capitalize text-foreground">
              {summary.observedConceptCount > 0 ? summary.averageConfidence : "Insufficient"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on observation volume and consistency
            </p>
          </CardContent>
        </Card>

        {/* Active Evidence Count */}
        <Card className="rounded-2xl shadow-xs border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessed Concepts</CardTitle>
            <Activity className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl md:text-4xl font-black tracking-tight text-foreground">
              {observedCount} <span className="text-lg font-normal text-muted-foreground">/ {totalConcepts}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {bands.strong} strong · {bands.needsAttention} need attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Course Mastery Progression Timeline (Snapshots) */}
      {summary.snapshots && summary.snapshots.length >= 2 && (
        <CourseTrendChart snapshots={summary.snapshots} />
      )}

      {/* Mastery Band Distribution Strip */}
      {totalConcepts > 0 && (
        <div className="p-4 rounded-2xl bg-card border shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
            <span className="font-bold uppercase tracking-wider text-muted-foreground">Mastery Distribution</span>
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Strong ({bands.strong})</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Proficient ({bands.proficient})</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Developing ({bands.developing})</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Needs Attention ({bands.needsAttention})</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" /> Not Assessed ({bands.notAssessed})</span>
            </div>
          </div>

          {/* Segmented bar */}
          <div className="w-full h-3 rounded-full bg-muted flex overflow-hidden">
            {bands.strong > 0 && (
              <div
                style={{ width: `${(bands.strong / totalConcepts) * 100}%` }}
                className="bg-emerald-500 transition-all"
                title={`Strong: ${bands.strong}`}
              />
            )}
            {bands.proficient > 0 && (
              <div
                style={{ width: `${(bands.proficient / totalConcepts) * 100}%` }}
                className="bg-blue-500 transition-all"
                title={`Proficient: ${bands.proficient}`}
              />
            )}
            {bands.developing > 0 && (
              <div
                style={{ width: `${(bands.developing / totalConcepts) * 100}%` }}
                className="bg-amber-500 transition-all"
                title={`Developing: ${bands.developing}`}
              />
            )}
            {bands.needsAttention > 0 && (
              <div
                style={{ width: `${(bands.needsAttention / totalConcepts) * 100}%` }}
                className="bg-rose-500 transition-all"
                title={`Needs Attention: ${bands.needsAttention}`}
              />
            )}
            {bands.notAssessed > 0 && (
              <div
                style={{ width: `${(bands.notAssessed / totalConcepts) * 100}%` }}
                className="bg-muted-foreground/30 transition-all"
                title={`Not Assessed: ${bands.notAssessed}`}
              />
            )}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card p-3 rounded-2xl border shadow-2xs">
        {/* Left: Search input */}
        <div className="flex items-center gap-2 flex-1">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search concepts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl bg-muted/40 border-transparent focus-visible:ring-1"
            />
          </div>

          <Button
            variant={coreOnly ? "secondary" : "ghost"}
            size="sm"
            className={`h-8 text-xs px-2.5 rounded-lg ${coreOnly ? "font-bold text-primary" : "text-muted-foreground"}`}
            onClick={() => setCoreOnly(!coreOnly)}
          >
            Core Only
          </Button>
        </div>

        {/* Center: Band Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "All" },
            { id: "strong", label: "Strong" },
            { id: "proficient", label: "Proficient" },
            { id: "developing", label: "Developing" },
            { id: "needs_attention", label: "Needs Attention" },
            { id: "not_assessed", label: "Not Assessed" },
          ].map((f) => (
            <Button
              key={f.id}
              variant={bandFilter === f.id ? "secondary" : "ghost"}
              size="sm"
              className={`h-7 px-2.5 text-xs rounded-lg ${
                bandFilter === f.id ? "font-bold text-primary" : "text-muted-foreground"
              }`}
              onClick={() => setBandFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {/* Right: Sort selector */}
        <div className="flex items-center gap-2 justify-end">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-8 text-xs px-2.5 rounded-xl border bg-background text-foreground"
          >
            <option value="mastery_desc">Highest Mastery</option>
            <option value="mastery_asc">Lowest Mastery</option>
            <option value="evidence_desc">Most Evidence</option>
            <option value="name_asc">Alphabetical (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Concept Mastery List */}
      {filteredConcepts.length === 0 ? (
        <Card className="p-12 text-center rounded-2xl border-dashed">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-lg mb-1">No Concepts Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            {totalConcepts === 0
              ? "This course does not have a Knowledge Graph yet. Generate the Knowledge Graph to extract concepts."
              : "No concepts match the selected search or band filters."}
          </p>

          {totalConcepts === 0 && (
            <Link href={`/dashboard/courses/${courseId}/knowledge-map`}>
              <Button size="sm">
                <Network className="w-4 h-4 mr-1.5" />
                Go to Knowledge Map
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredConcepts.map((c) => {
            const hasEvidence = c.evidenceCount > 0 && c.masteryBand !== "insufficient_evidence";
            const masteryPct = Math.round(c.masteryProbability * 100);

            return (
              <div
                key={c.conceptId}
                className="p-4 rounded-2xl bg-card hover:bg-muted/30 border transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs group"
                onClick={() => setSelectedConceptId(c.conceptId)}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Left: Concept details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-base text-foreground group-hover:text-primary transition-colors truncate">
                        {c.conceptName}
                      </span>
                      {c.importance === "core" && (
                        <Badge variant="default" className="text-[9px] uppercase tracking-wider py-0 px-1.5 font-bold">
                          Core
                        </Badge>
                      )}
                      {c.conceptType && (
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider py-0 px-1.5 text-muted-foreground">
                          {c.conceptType}
                        </Badge>
                      )}
                      {getBandBadge(c.masteryBand, c.evidenceCount)}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>
                        Evidence: <strong>{c.evidenceCount}</strong> graded response{c.evidenceCount === 1 ? "" : "s"}
                      </span>
                      <span>•</span>
                      <span>Confidence: {getConfidenceBadge(c.confidence, c.evidenceCount)}</span>
                      {hasEvidence && (
                        <>
                          <span>•</span>
                          <span>Trend: {getTrendIcon(c.trend)}</span>
                        </>
                      )}
                      {c.readiness && c.readiness !== "not_applicable" && (
                        <>
                          <span>•</span>
                          <span className="text-[11px]">
                            Prereqs: <span className="font-medium capitalize">{c.readiness.replace("_", " ")}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Mastery Gauge / Bar */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="w-32 md:w-40 flex flex-col items-end">
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">Mastery</span>
                        <span className="font-mono font-bold text-sm text-foreground">
                          {hasEvidence ? `${masteryPct}%` : "—"}
                        </span>
                      </div>
                      <Progress
                        value={hasEvidence ? masteryPct : 0}
                        className={`h-2 w-full ${!hasEvidence ? "opacity-30" : ""}`}
                      />
                    </div>

                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg shrink-0 text-muted-foreground group-hover:text-foreground">
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Concept Progress Drawer */}
      <ConceptProgressDrawer
        conceptId={selectedConceptId}
        courseId={courseId}
        isOpen={!!selectedConceptId}
        onClose={() => setSelectedConceptId(null)}
      />
    </div>
  );
}
