import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireUser } from "./courses";

async function assertCourseOwnershipIfReal(ctx, user, courseId) {
  if (!courseId || typeof courseId !== "string") return;
  const normalizedId = ctx.db.normalizeId("courses", courseId);
  if (!normalizedId) return;
  const course = await ctx.db.get(normalizedId);
  if (!course || course.userId !== user._id) {
    throw new Error("Unauthorized course access");
  }
}

async function assertRunOwnership(ctx, user, evaluationRunId) {
  const run = await ctx.db.get(evaluationRunId);
  if (!run || run.userId !== user._id) {
    throw new Error("Evaluation run not found or unauthorized");
  }
  return run;
}

export const getEvaluationRuns = query({
  args: {
    runType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let runs;
    if (args.runType) {
      runs = await ctx.db
        .query("evaluationRuns")
        .withIndex("by_user_run_type", (q) =>
          q.eq("userId", user._id).eq("runType", args.runType)
        )
        .collect();
    } else {
      runs = await ctx.db
        .query("evaluationRuns")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
    }

    runs.sort((a, b) => b.createdAt - a.createdAt);
    const maxItems = args.limit ?? 50;
    return runs.slice(0, maxItems);
  },
});

export const getBaselineRun = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const baselines = await ctx.db
      .query("evaluationRuns")
      .withIndex("by_user_baseline", (q) =>
        q.eq("userId", user._id).eq("isBaseline", true)
      )
      .collect();

    if (baselines.length === 0) return null;
    baselines.sort((a, b) => b.createdAt - a.createdAt);
    return baselines[0];
  },
});

export const getEvaluationRunDetails = query({
  args: {
    evaluationRunId: v.id("evaluationRuns"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const run = await ctx.db.get(args.evaluationRunId);
    if (!run || run.userId !== user._id) return null;

    const [cases, results, metrics] = await Promise.all([
      ctx.db
        .query("evaluationCases")
        .withIndex("by_run", (q) => q.eq("evaluationRunId", run._id))
        .collect(),
      ctx.db
        .query("evaluationResults")
        .withIndex("by_run", (q) => q.eq("evaluationRunId", run._id))
        .collect(),
      ctx.db
        .query("evaluationMetrics")
        .withIndex("by_run", (q) => q.eq("evaluationRunId", run._id))
        .collect(),
    ]);

    let baselineRun = null;
    if (run.baselineRunId) {
      const candidate = await ctx.db.get(run.baselineRunId);
      if (candidate && candidate.userId === user._id) {
        baselineRun = candidate;
      }
    }

    return {
      run,
      cases,
      results,
      metrics,
      baselineRun,
    };
  },
});

export const createEvaluationRun = mutation({
  args: {
    externalRunId: v.optional(v.string()),
    runType: v.string(),
    courseId: v.optional(v.union(v.id("courses"), v.string(), v.null())),
    status: v.optional(v.string()),
    datasetVersion: v.string(),
    evaluatorVersion: v.string(),
    modelVersion: v.string(),
    promptVersions: v.optional(v.any()),
    runConfig: v.optional(v.any()),
    caseCount: v.optional(v.number()),
    baselineRunId: v.optional(v.union(v.id("evaluationRuns"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await assertCourseOwnershipIfReal(ctx, user, args.courseId);

    if (args.baselineRunId) {
      await assertRunOwnership(ctx, user, args.baselineRunId);
    }

    const now = Date.now();
    return await ctx.db.insert("evaluationRuns", {
      userId: user._id,
      externalRunId: args.externalRunId,
      runType: args.runType,
      courseId: args.courseId ?? null,
      status: args.status ?? "queued",
      datasetVersion: args.datasetVersion,
      evaluatorVersion: args.evaluatorVersion,
      modelVersion: args.modelVersion,
      promptVersions: args.promptVersions ?? {},
      runConfig: args.runConfig ?? {},
      startedAt: now,
      completedAt: null,
      caseCount: args.caseCount ?? 0,
      passedCount: 0,
      failedCount: 0,
      progress: 0,
      isBaseline: false,
      baselineRunId: args.baselineRunId ?? null,
      baselineComparison: null,
      releaseGate: null,
      latencyStats: null,
      usageStats: null,
      failureStats: null,
      errorMessage: null,
      createdAt: now,
    });
  },
});

export const updateEvaluationRun = mutation({
  args: {
    evaluationRunId: v.id("evaluationRuns"),
    status: v.optional(v.string()),
    progress: v.optional(v.number()),
    caseCount: v.optional(v.number()),
    passedCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    completedAt: v.optional(v.union(v.number(), v.null())),
    baselineRunId: v.optional(v.union(v.id("evaluationRuns"), v.null())),
    baselineComparison: v.optional(v.any()),
    releaseGate: v.optional(v.any()),
    latencyStats: v.optional(v.any()),
    usageStats: v.optional(v.any()),
    failureStats: v.optional(v.any()),
    errorMessage: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const run = await assertRunOwnership(ctx, user, args.evaluationRunId);

    const patch = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.progress !== undefined) patch.progress = args.progress;
    if (args.caseCount !== undefined) patch.caseCount = args.caseCount;
    if (args.passedCount !== undefined) patch.passedCount = args.passedCount;
    if (args.failedCount !== undefined) patch.failedCount = args.failedCount;
    if (args.completedAt !== undefined) patch.completedAt = args.completedAt;
    if (args.baselineRunId !== undefined) patch.baselineRunId = args.baselineRunId;
    if (args.baselineComparison !== undefined) patch.baselineComparison = args.baselineComparison;
    if (args.releaseGate !== undefined) patch.releaseGate = args.releaseGate;
    if (args.latencyStats !== undefined) patch.latencyStats = args.latencyStats;
    if (args.usageStats !== undefined) patch.usageStats = args.usageStats;
    if (args.failureStats !== undefined) patch.failureStats = args.failureStats;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;

    await ctx.db.patch(run._id, patch);
    return await ctx.db.get(run._id);
  },
});

export const saveEvaluationBatch = mutation({
  args: {
    evaluationRunId: v.id("evaluationRuns"),
    cases: v.optional(
      v.array(
        v.object({
          caseId: v.string(),
          category: v.string(),
          input: v.any(),
          expectedBehavior: v.any(),
          expectedEvidence: v.optional(v.any()),
          expectedConcepts: v.optional(v.array(v.string())),
          metadata: v.optional(v.any()),
        })
      )
    ),
    results: v.optional(
      v.array(
        v.object({
          caseId: v.string(),
          category: v.string(),
          systemOutput: v.any(),
          passed: v.boolean(),
          criticalFailure: v.optional(v.boolean()),
          scores: v.any(),
          failureReasons: v.array(v.string()),
          retrievedEvidenceIds: v.optional(v.array(v.string())),
          citationValidation: v.optional(v.any()),
          latencyMs: v.number(),
        })
      )
    ),
    metrics: v.optional(
      v.array(
        v.object({
          metricName: v.string(),
          value: v.number(),
          numerator: v.optional(v.union(v.number(), v.null())),
          denominator: v.optional(v.union(v.number(), v.null())),
          category: v.string(),
          description: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const run = await assertRunOwnership(ctx, user, args.evaluationRunId);
    const now = Date.now();

    let savedCases = 0;
    let savedResults = 0;
    let savedMetrics = 0;

    if (args.cases) {
      for (const c of args.cases) {
        await ctx.db.insert("evaluationCases", {
          userId: user._id,
          evaluationRunId: run._id,
          caseId: c.caseId,
          category: c.category,
          input: c.input,
          expectedBehavior: c.expectedBehavior,
          expectedEvidence: c.expectedEvidence ?? null,
          expectedConcepts: c.expectedConcepts ?? [],
          metadata: c.metadata ?? {},
          createdAt: now,
        });
        savedCases += 1;
      }
    }

    if (args.results) {
      for (const r of args.results) {
        await ctx.db.insert("evaluationResults", {
          userId: user._id,
          evaluationRunId: run._id,
          caseId: r.caseId,
          category: r.category,
          systemOutput: r.systemOutput,
          passed: r.passed,
          criticalFailure: r.criticalFailure ?? false,
          scores: r.scores,
          failureReasons: r.failureReasons,
          retrievedEvidenceIds: r.retrievedEvidenceIds ?? [],
          citationValidation: r.citationValidation ?? null,
          latencyMs: r.latencyMs,
          humanOverride: null,
          createdAt: now,
        });
        savedResults += 1;
      }
    }

    if (args.metrics) {
      for (const m of args.metrics) {
        await ctx.db.insert("evaluationMetrics", {
          userId: user._id,
          evaluationRunId: run._id,
          metricName: m.metricName,
          value: m.value,
          numerator: m.numerator ?? null,
          denominator: m.denominator ?? null,
          category: m.category,
          description: m.description ?? undefined,
          createdAt: now,
        });
        savedMetrics += 1;
      }
    }

    return { savedCases, savedResults, savedMetrics };
  },
});

export const setBaselineRun = mutation({
  args: {
    evaluationRunId: v.id("evaluationRuns"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const targetRun = await assertRunOwnership(ctx, user, args.evaluationRunId);

    const existingBaselines = await ctx.db
      .query("evaluationRuns")
      .withIndex("by_user_baseline", (q) =>
        q.eq("userId", user._id).eq("isBaseline", true)
      )
      .collect();

    for (const run of existingBaselines) {
      if (run._id !== targetRun._id) {
        await ctx.db.patch(run._id, { isBaseline: false });
      }
    }

    await ctx.db.patch(targetRun._id, { isBaseline: true });
    return await ctx.db.get(targetRun._id);
  },
});

export const recordHumanOverride = mutation({
  args: {
    evaluationResultId: v.id("evaluationResults"),
    verdict: v.string(), // "evaluator_incorrect" | "confirmed_failure" | "needs_investigation"
    overriddenPassed: v.boolean(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db.get(args.evaluationResultId);
    if (!result || result.userId !== user._id) {
      throw new Error("Evaluation result not found or unauthorized");
    }

    // Store human override separately while keeping automated verdict & scores immutable
    await ctx.db.patch(result._id, {
      humanOverride: {
        verdict: args.verdict,
        overriddenPassed: args.overriddenPassed,
        reason: args.reason,
        reviewerUserId: user._id,
        reviewedAt: Date.now(),
        originalAutomatedPassed: result.passed,
      },
    });

    return await ctx.db.get(result._id);
  },
});

export const deleteEvaluationRun = mutation({
  args: {
    evaluationRunId: v.id("evaluationRuns"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const run = await assertRunOwnership(ctx, user, args.evaluationRunId);

    const [cases, results, metrics] = await Promise.all([
      ctx.db
        .query("evaluationCases")
        .withIndex("by_run", (q) => q.eq("evaluationRunId", run._id))
        .collect(),
      ctx.db
        .query("evaluationResults")
        .withIndex("by_run", (q) => q.eq("evaluationRunId", run._id))
        .collect(),
      ctx.db
        .query("evaluationMetrics")
        .withIndex("by_run", (q) => q.eq("evaluationRunId", run._id))
        .collect(),
    ]);

    for (const c of cases) await ctx.db.delete(c._id);
    for (const r of results) await ctx.db.delete(r._id);
    for (const m of metrics) await ctx.db.delete(m._id);
    await ctx.db.delete(run._id);

    return { deleted: true };
  },
});

