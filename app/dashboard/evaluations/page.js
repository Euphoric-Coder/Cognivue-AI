"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  Download,
  Flag,
  FlaskConical,
  Gauge,
  GitCompare,
  Info,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { RunEvaluationDialog } from "@/components/evaluations/run-evaluation-dialog";
import { FailedCaseInspector } from "@/components/evaluations/failed-case-inspector";
import { EvaluationResultsTable } from "@/components/evaluations/evaluation-table";

const SUMMARY_METRIC_DEFS = [
  { key: "overall_pass_rate", label: "Overall Pass Rate" },
  { key: "rag_faithfulness", label: "RAG Faithfulness" },
  { key: "rag_context_relevance", label: "Context Relevance" },
  { key: "citation_accuracy", label: "Citation Accuracy" },
  { key: "grounded_refusal_accuracy", label: "Grounded Refusal" },
  { key: "objective_grading_accuracy", label: "Objective Grading" },
  { key: "knowledge_graph_pass_rate", label: "Knowledge Graph" },
  { key: "adaptive_tutor_pass_rate", label: "Adaptive Tutoring" },
  { key: "study_intelligence_pass_rate", label: "Study Intelligence" },
  { key: "security_pass_rate", label: "Security & Isolation" },
];

function formatPercent(val) {
  if (typeof val !== "number" || Number.isNaN(val)) return "—";
  return `${(val * 100).toFixed(1)}%`;
}

export default function EvaluationsDashboardPage() {
  const rawRuns = useQuery(api.evaluations.getEvaluationRuns, { limit: 30 });
  const runs = useMemo(() => rawRuns ?? [], [rawRuns]);
  const baselineRun = useQuery(api.evaluations.getBaselineRun, {});

  const [selectedRunId, setSelectedRunId] = useState(null);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [liveProgress, setLiveProgress] = useState(null);
  const [inspectorState, setInspectorState] = useState({ open: false, evalCase: null, evalResult: null });

  const activeRunId = useMemo(() => {
    if (selectedRunId && runs.some((r) => r._id === selectedRunId)) {
      return selectedRunId;
    }
    return runs[0]?._id ?? null;
  }, [selectedRunId, runs]);

  const runDetails = useQuery(
    api.evaluations.getEvaluationRunDetails,
    activeRunId ? { evaluationRunId: activeRunId } : "skip"
  );

  const baselineDetails = useQuery(
    api.evaluations.getEvaluationRunDetails,
    baselineRun?._id && baselineRun._id !== activeRunId
      ? { evaluationRunId: baselineRun._id }
      : "skip"
  );

  const createRunMutation = useMutation(api.evaluations.createEvaluationRun);
  const updateRunMutation = useMutation(api.evaluations.updateEvaluationRun);
  const saveBatchMutation = useMutation(api.evaluations.saveEvaluationBatch);
  const setBaselineMutation = useMutation(api.evaluations.setBaselineRun);
  const recordOverrideMutation = useMutation(api.evaluations.recordHumanOverride);
  const deleteRunMutation = useMutation(api.evaluations.deleteEvaluationRun);

  const activeRun = runDetails?.run ?? null;
  const activeCases = useMemo(() => runDetails?.cases ?? [], [runDetails]);
  const activeResults = useMemo(() => runDetails?.results ?? [], [runDetails]);
  const activeMetrics = useMemo(() => runDetails?.metrics ?? [], [runDetails]);

  const metricsMap = useMemo(() => {
    const map = {};
    for (const m of activeMetrics) {
      map[m.metricName] = m;
    }
    return map;
  }, [activeMetrics]);

  // Compute live baseline comparison client-side if baselineDetails loaded
  const computedBaselineComparison = useMemo(() => {
    if (!activeRun) return null;
    if (activeRun.baselineComparison) return activeRun.baselineComparison;
    if (!baselineRun || baselineRun._id === activeRun._id || !baselineDetails?.metrics) return null;

    const baseMap = {};
    for (const m of baselineDetails.metrics) baseMap[m.metricName] = m.value;
    const rows = [];
    const regressions = [];
    for (const m of activeMetrics) {
      if (baseMap[m.metricName] === undefined) continue;
      const baseVal = baseMap[m.metricName];
      const delta = Number((m.value - baseVal).toFixed(4));
      const status = delta < -0.02 ? "regressed" : delta > 0.02 ? "improved" : "unchanged";
      if (status === "regressed") regressions.push({ metricName: m.metricName, baseline: baseVal, current: m.value, delta });
      rows.push({ metricName: m.metricName, baseline: baseVal, current: m.value, delta, status });
    }
    return {
      hasRegressions: regressions.length > 0,
      regressionCount: regressions.length,
      regressions,
      comparisons: rows,
    };
  }, [activeRun, activeMetrics, baselineRun, baselineDetails]);

  const handleLaunchEvaluation = async (config) => {
    setIsRunning(true);
    setLiveProgress({ status: "running", progress: 10 });
    let convexRunId = null;

    try {
      const metaRes = await fetch("/api/evaluation?action=metadata");
      const metaJson = metaRes.ok ? await metaRes.json() : {};
      const meta = metaJson.metadata || {};

      convexRunId = await createRunMutation({
        runType: config.runType,
        courseId: null,
        status: "running",
        datasetVersion: meta.datasetVersion || "cognivue-eval-v1",
        evaluatorVersion: meta.evaluatorVersion || "eval-v1.0",
        modelVersion: meta.modelVersion || "gemini-3.6-flash",
        promptVersions: meta.promptVersions || {},
        runConfig: {
          maxCases: config.maxCases,
          useLiveLlm: config.useLiveLlm,
          isolatedMode: true,
        },
        baselineRunId: baselineRun?._id ?? null,
      });

      setSelectedRunId(convexRunId);
      setIsRunModalOpen(false);
      setLiveProgress({ status: "running", progress: 45 });

      const execRes = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          runType: config.runType,
          maxCases: config.maxCases,
          useLiveLlm: config.useLiveLlm,
          externalRunId: convexRunId,
        }),
      });

      if (!execRes.ok) {
        const err = await execRes.json().catch(() => ({}));
        throw new Error(err.error || "Evaluation backend failed");
      }

      const payload = await execRes.json();
      setLiveProgress({ status: "running", progress: 80 });

      // Persist cases, results, and metrics to Convex in clean batches
      const sanitizedCases = (payload.cases || []).map((c) => ({
        caseId: c.caseId,
        category: c.category,
        input: c.input,
        expectedBehavior: c.expectedBehavior,
        expectedEvidence: c.expectedEvidence ?? null,
        expectedConcepts: c.expectedConcepts ?? [],
        metadata: c.metadata ?? {},
      }));

      const sanitizedResults = (payload.results || []).map((r) => ({
        caseId: r.caseId,
        category: r.category,
        systemOutput: r.systemOutput,
        passed: Boolean(r.passed),
        criticalFailure: Boolean(r.criticalFailure),
        scores: r.scores || {},
        failureReasons: r.failureReasons || [],
        retrievedEvidenceIds: r.retrievedEvidenceIds || [],
        citationValidation: r.citationValidation ?? null,
        latencyMs: Number(r.latencyMs || 0),
      }));

      const sanitizedMetrics = (payload.metrics || []).map((m) => ({
        metricName: m.metricName,
        value: Number(m.value),
        numerator: m.numerator ?? null,
        denominator: m.denominator ?? null,
        category: m.category,
        description: m.description,
      }));

      await saveBatchMutation({
        evaluationRunId: convexRunId,
        cases: sanitizedCases,
        results: sanitizedResults,
        metrics: sanitizedMetrics,
      });

      await updateRunMutation({
        evaluationRunId: convexRunId,
        status: "completed",
        progress: 100,
        caseCount: payload.caseCount,
        passedCount: payload.passedCount,
        failedCount: payload.failedCount,
        completedAt: payload.completedAt || Date.now(),
        releaseGate: payload.releaseGate,
        latencyStats: payload.latencyStats,
        usageStats: payload.usageStats,
        failureStats: payload.failureStats,
      });

      setLiveProgress(null);
      toast.success(`Evaluation completed: ${payload.passedCount}/${payload.caseCount} cases passed`);
    } catch (err) {
      if (convexRunId) {
        await updateRunMutation({
          evaluationRunId: convexRunId,
          status: "failed",
          errorMessage: err.message,
          completedAt: Date.now(),
        }).catch(() => {});
      }
      setLiveProgress(null);
      toast.error(`Evaluation failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSetBaseline = async () => {
    if (!activeRun?._id) return;
    await setBaselineMutation({ evaluationRunId: activeRun._id });
    toast.success("Pinned current run as baseline reference");
  };

  const handleDeleteRun = async () => {
    if (!activeRun?._id) return;
    await deleteRunMutation({ evaluationRunId: activeRun._id });
    setSelectedRunId(null);
    toast.success("Deleted evaluation run");
  };

  const handleExport = (format) => {
    if (!activeRun) return;
    const reportObj = {
      run: activeRun,
      metrics: activeMetrics,
      cases: activeCases,
      results: activeResults,
    };

    let content = "";
    let mime = "application/json";
    let ext = "json";

    if (format === "md") {
      ext = "md";
      mime = "text/markdown";
      const rg = activeRun.releaseGate || {};
      const lines = [
        `# Cognivue AI Evaluation Report (${activeRun._id})`,
        "",
        `- **Run Type**: \`${activeRun.runType}\``,
        `- **Dataset Version**: \`${activeRun.datasetVersion}\``,
        `- **Evaluator Version**: \`${activeRun.evaluatorVersion}\``,
        `- **Model Version**: \`${activeRun.modelVersion}\``,
        `- **Release Gate**: **${rg.status || "N/A"}**`,
        `- **Pass Count**: ${activeRun.passedCount} / ${activeRun.caseCount}`,
        "",
        "## Metrics",
        "| Category | Metric | Value | Numerator / Denominator |",
        "| :--- | :--- | :--- | :--- |",
        ...activeMetrics.map((m) => {
          const ratio = m.numerator != null && m.denominator != null ? `${m.numerator}/${m.denominator}` : "—";
          return `| ${m.category} | \`${m.metricName}\` | ${formatPercent(m.value)} | ${ratio} |`;
        }),
      ];
      content = lines.join("\n") + "\n";
    } else {
      content = JSON.stringify(reportObj, null, 2);
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cognivue_eval_${activeRun.runType}_${activeRun._id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const operatorEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_EVAL_DASHBOARD === "true";

  if (!operatorEnabled) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Internal Evaluation Console Restricted
            </CardTitle>
            <CardDescription>
              The internal V11 benchmarking console is disabled in standard student production mode. Set NEXT_PUBLIC_ENABLE_EVAL_DASHBOARD=true in authorized operator environments to enable access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              System Evaluation & Benchmarking
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              V11 Internal
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Evidence-backed quality telemetry across Retrieval, Visual RAG, Knowledge Graph, Assessment, Grading, Learner Model, Adaptive Tutor, Study Intelligence & Security.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {runs.length > 0 && (
            <>
              <label htmlFor="select-eval-run" className="sr-only">Select evaluation run</label>
              <select
                id="select-eval-run"
                value={activeRunId || ""}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs font-mono"
              >
                {runs.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.runType} • {new Date(r.createdAt).toLocaleString()} ({r.passedCount}/{r.caseCount})
                    {r.isBaseline ? " ★ BASELINE" : ""}
                  </option>
                ))}
              </select>
            </>
          )}

          <Button onClick={() => setIsRunModalOpen(true)} disabled={isRunning} className="gap-2">
            <Play className="h-4 w-4" />
            Run Evaluation
          </Button>
        </div>
      </div>

      {/* Isolation & Reproducibility Notice */}
      <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>
            <strong>Strict Isolation Active:</strong> Benchmarks execute on isolated versioned fixtures (`cognivue-eval-v1`). Production learner mastery, sources, and assessments are untouched.
          </span>
        </div>
        {activeRun && (
          <div className="flex flex-wrap items-center gap-1.5 font-mono">
            <Badge variant="outline">{activeRun.datasetVersion}</Badge>
            <Badge variant="outline">{activeRun.evaluatorVersion}</Badge>
            <Badge variant="outline">{activeRun.modelVersion}</Badge>
          </div>
        )}
      </div>

      {liveProgress && (
        <Card>
          <CardContent className="pt-5 space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span>Running Isolated Evaluation Suite...</span>
              <span>{liveProgress.progress}%</span>
            </div>
            <Progress value={liveProgress.progress} />
          </CardContent>
        </Card>
      )}

      {/* Empty State — Never fabricate demo scores */}
      {!activeRun ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              No Stored Evaluation Runs Yet
            </CardTitle>
            <CardDescription>
              Cognivue V11 never displays fabricated or hard-coded benchmark numbers. Launch an isolated Quick Suite or Full Suite run to measure actual subsystem metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsRunModalOpen(true)} className="gap-2">
              <Play className="h-4 w-4" />
              Launch First Evaluation Run
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Release Gate + Action Toolbar */}
          <Card className={activeRun.releaseGate?.releaseReady ? "border-emerald-500/40" : "border-destructive/50"}>
            <CardContent className="pt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {activeRun.releaseGate?.releaseReady ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-destructive" />
                  )}
                  <span className="font-semibold text-base">
                    Release Readiness Gate: {activeRun.releaseGate?.status || activeRun.status.toUpperCase()}
                  </span>
                  {activeRun.isBaseline && (
                    <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30" variant="outline">
                      Active Baseline
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeRun.passedCount} passed, {activeRun.failedCount} failed across {activeRun.caseCount} evaluated cases.{" "}
                  {activeRun.releaseGate?.blockers?.length > 0
                    ? `${activeRun.releaseGate.blockers.length} blocker(s) detected.`
                    : "All critical invariants and minimum quality thresholds satisfied."}
                </p>
                {activeRun.releaseGate?.blockers?.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-destructive pt-1">
                    {activeRun.releaseGate.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!activeRun.isBaseline && (
                  <Button variant="outline" size="sm" onClick={handleSetBaseline} className="gap-1.5">
                    <Flag className="h-3.5 w-3.5" />
                    Set Baseline
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => handleExport("json")} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport("md")} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export MD
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDeleteRun} className="text-destructive hover:text-destructive gap-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview & Telemetry</TabsTrigger>
              <TabsTrigger value="cases">Case Inspector ({activeResults.length})</TabsTrigger>
              <TabsTrigger value="baseline">Baseline Comparison</TabsTrigger>
              <TabsTrigger value="versions">Versions & Thresholds</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Aggregation Formula Explanation */}
              <div className="rounded-lg border bg-card p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  <strong>Exact Metric Aggregation:</strong> Each card displays <code>numerator / denominator</code> directly computed from stored <code>evaluationResults</code> in this run. Human overrides are recorded independently and never overwrite automated scores.
                </span>
              </div>

              {/* Computed Subsystem Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {SUMMARY_METRIC_DEFS.map((def) => {
                  const m = metricsMap[def.key];
                  return (
                    <Card key={def.key}>
                      <CardHeader className="pb-2">
                        <CardDescription className="text-xs font-medium">{def.label}</CardDescription>
                        <CardTitle className="text-2xl font-mono">
                          {m ? formatPercent(m.value) : "—"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground font-mono">
                        {m && m.numerator != null && m.denominator != null
                          ? `${m.numerator} / ${m.denominator}`
                          : "Not in this run"}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Latency & Cost Usage */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-primary" />
                      Latency Percentiles
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-4 gap-2 text-center">
                    {[
                      ["Mean", activeRun.latencyStats?.meanMs],
                      ["p50", activeRun.latencyStats?.p50Ms],
                      ["p95", activeRun.latencyStats?.p95Ms],
                      ["Max", activeRun.latencyStats?.maxMs],
                    ].map(([label, val]) => (
                      <div key={label} className="rounded-md border p-2.5">
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="text-base font-mono font-semibold mt-0.5">
                          {val != null ? `${val} ms` : "—"}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      Judge Calls & Estimated Cost
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-md border p-2.5">
                      <div className="text-xs text-muted-foreground">Judge Calls</div>
                      <div className="text-base font-mono font-semibold mt-0.5">
                        {activeRun.usageStats?.judgeCalls ?? 0}
                      </div>
                    </div>
                    <div className="rounded-md border p-2.5">
                      <div className="text-xs text-muted-foreground">Prompt Tok</div>
                      <div className="text-base font-mono font-semibold mt-0.5">
                        {activeRun.usageStats?.promptTokens ?? 0}
                      </div>
                    </div>
                    <div className="rounded-md border p-2.5">
                      <div className="text-xs text-muted-foreground">Compl Tok</div>
                      <div className="text-base font-mono font-semibold mt-0.5">
                        {activeRun.usageStats?.completionTokens ?? 0}
                      </div>
                    </div>
                    <div className="rounded-md border p-2.5">
                      <div className="text-xs text-muted-foreground">Est Cost</div>
                      <div className="text-base font-mono font-semibold mt-0.5">
                        ${activeRun.usageStats?.estimatedCostUsd ?? 0}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="cases">
              <EvaluationResultsTable
                cases={activeCases}
                results={activeResults}
                onInspect={(evalCase, evalResult) =>
                  setInspectorState({ open: true, evalCase, evalResult })
                }
              />
            </TabsContent>

            <TabsContent value="baseline">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitCompare className="h-4 w-4 text-primary" />
                    Baseline Regression Analysis
                  </CardTitle>
                  <CardDescription>
                    {baselineRun
                      ? `Comparing current run against Baseline (${baselineRun.runType} • ${new Date(baselineRun.createdAt).toLocaleString()}).`
                      : "No baseline run pinned yet. Click 'Set Baseline' on a verified reference run to enable regression alerts."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!computedBaselineComparison ? (
                    <p className="text-sm text-muted-foreground">
                      {baselineRun && baselineRun._id === activeRun._id
                        ? "Currently viewing the pinned baseline run itself. Run or select another evaluation run to view delta comparisons."
                        : "Select a run and ensure a baseline run is pinned to compute deltas."}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {computedBaselineComparison.hasRegressions && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                          <strong>Regression Alert:</strong> {computedBaselineComparison.regressionCount} metric(s) dropped below tolerance (-2.0%).
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {computedBaselineComparison.comparisons.map((row) => (
                          <div key={row.metricName} className="rounded-md border p-3 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-mono font-semibold">{row.metricName}</div>
                              <div className="text-muted-foreground">
                                Base {formatPercent(row.baseline)} → Curr {formatPercent(row.current)}
                              </div>
                            </div>
                            <Badge
                              variant={
                                row.status === "regressed"
                                  ? "destructive"
                                  : row.status === "improved"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="font-mono"
                            >
                              {row.delta >= 0 ? "+" : ""}
                              {(row.delta * 100).toFixed(1)}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="versions">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Reproducibility Stamp</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs font-mono">
                    <div>Dataset: {activeRun.datasetVersion}</div>
                    <div>Evaluator: {activeRun.evaluatorVersion}</div>
                    <div>LLM Model: {activeRun.modelVersion}</div>
                    <div>Prompts: {JSON.stringify(activeRun.promptVersions || {})}</div>
                    <div>Config: {JSON.stringify(activeRun.runConfig || {})}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Release Threshold Checks</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {(activeRun.releaseGate?.thresholdChecks || []).map((tc) => (
                      <div key={tc.metricName} className="flex items-center justify-between border-b pb-1.5">
                        <span className="font-mono">{tc.metricName}</span>
                        <span className="font-mono">
                          {formatPercent(tc.observed)} / min {formatPercent(tc.threshold)}{" "}
                          <Badge variant={tc.passed ? "secondary" : "destructive"} className="ml-1">
                            {tc.passed ? "OK" : "BELOW"}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      <RunEvaluationDialog
        open={isRunModalOpen}
        onOpenChange={setIsRunModalOpen}
        onLaunch={handleLaunchEvaluation}
        baselineRunId={baselineRun?._id}
        isSubmitting={isRunning}
      />

      <FailedCaseInspector
        open={inspectorState.open}
        onOpenChange={(open) => setInspectorState((prev) => ({ ...prev, open }))}
        evalCase={inspectorState.evalCase}
        evalResult={inspectorState.evalResult}
        courseId={activeRun?.courseId}
        canOverride={Boolean(inspectorState.evalResult?._id)}
        onRecordOverride={async (args) => {
          await recordOverrideMutation(args);
          toast.success("Human review saved without altering automated metrics");
        }}
      />
    </div>
  );
}
