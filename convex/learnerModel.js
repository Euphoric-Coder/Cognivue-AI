import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./courses";

const MODEL_VERSION = "mastery-v1";

const DIFFICULTY_WEIGHTS = {
  easy: 0.8,
  medium: 1.0,
  hard: 1.2,
};

const QUESTION_TYPE_WEIGHTS = {
  true_false: 0.85,
  mcq: 1.0,
  multiple_select: 1.05,
  numerical: 1.1,
  short_answer: 1.15,
  concept_explanation: 1.2,
};

const IMPORTANCE_WEIGHTS = {
  core: 1.5,
  supporting: 1.0,
  minor: 0.7,
};

/**
 * Calculates smooth exponential recency decay.
 * Half-life of 45 days, clamped to minimum weight of 0.60.
 */
function calculateRecencyWeight(timestamp, now) {
  const daysAgo = Math.max(0, (now - timestamp) / (1000 * 60 * 60 * 24));
  return Math.max(0.60, Math.pow(0.5, daysAgo / 45.0));
}

/**
 * Calculates deterministic multi-factor confidence.
 */
function calculateConfidence(observations) {
  const count = observations.length;
  if (count === 0) {
    return { level: "insufficient", score: 0.0 };
  }

  // 1. Volume factor (scales to 1.0 at 5 observations)
  const volumeFactor = Math.min(1.0, count / 5.0);

  // 2. Difficulty variety factor
  const diffs = new Set(observations.map((o) => o.difficulty));
  const varietyFactor = diffs.size >= 3 ? 1.0 : diffs.size === 2 ? 0.88 : 0.75;

  // 3. Consistency factor (penalizes alternating extremes)
  const scores = observations.map((o) => o.scoreFraction);
  const mean = scores.reduce((sum, s) => sum + s, 0) / count;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / count;
  const consistencyFactor = Math.max(0.5, 1.0 - 1.8 * variance);

  const confidenceScore = Math.round(volumeFactor * varietyFactor * consistencyFactor * 100) / 100;

  let level = "low";
  if (count >= 5 && confidenceScore >= 0.70) {
    level = "high";
  } else if (count >= 3 && confidenceScore >= 0.35) {
    level = "medium";
  } else if (count < 1) {
    level = "insufficient";
  }

  return { level, score: confidenceScore };
}

/**
 * Calculates trend by comparing recent half of observations vs earlier half.
 */
function calculateTrend(observations) {
  if (observations.length < 3) {
    return { trend: "insufficient_data", delta: 0.0 };
  }

  const sorted = [...observations].sort((a, b) => a.timestamp - b.timestamp);
  const mid = Math.floor(sorted.length / 2);
  const earlier = sorted.slice(0, mid);
  const recent = sorted.slice(mid);

  const earlierMean = earlier.reduce((sum, o) => sum + o.scoreFraction, 0) / earlier.length;
  const recentMean = recent.reduce((sum, o) => sum + o.scoreFraction, 0) / recent.length;
  const delta = Math.round((recentMean - earlierMean) * 100) / 100;

  if (delta > 0.08) {
    return { trend: "improving", delta };
  } else if (delta < -0.08) {
    return { trend: "declining", delta };
  } else {
    return { trend: "stable", delta };
  }
}

/**
 * Determines mastery band based on probability and evidence count.
 */
function determineMasteryBand(masteryProbability, evidenceCount, confidenceLevel) {
  if (evidenceCount === 0) {
    return "insufficient_evidence";
  }

  if (evidenceCount < 3) {
    // Low evidence / provisional: cannot be labeled strong or proficient yet
    return masteryProbability >= 0.60 ? "developing" : "needs_attention";
  }

  if (masteryProbability >= 0.80) {
    // Requires at least medium confidence to be labeled strong
    return confidenceLevel === "low" ? "proficient" : "strong";
  } else if (masteryProbability >= 0.60) {
    return "proficient";
  } else if (masteryProbability >= 0.40) {
    return "developing";
  } else {
    return "needs_attention";
  }
}

/**
 * Internal computation engine for a set of concepts in a course.
 */
async function computeConceptStates(ctx, userId, courseId, conceptIds, now = Date.now()) {
  const affectedConceptSet = new Set(conceptIds.map(String));

  // 1. Fetch active concepts
  const allConcepts = await ctx.db
    .query("courseConcepts")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();

  const conceptsById = new Map();
  for (const c of allConcepts) {
    conceptsById.set(c._id, c);
  }

  // 2. Fetch prerequisite relationships for the course
  const allRels = await ctx.db
    .query("conceptRelationships")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();

  const prereqsByConceptId = new Map();
  for (const rel of allRels) {
    if (rel.relationType === "PREREQUISITE_OF" || rel.relationType === "DEPENDS_ON") {
      const targetId = rel.toConceptId;
      const prereqId = rel.fromConceptId;
      if (!prereqsByConceptId.has(targetId)) {
        prereqsByConceptId.set(targetId, []);
      }
      prereqsByConceptId.get(targetId).push(prereqId);
    }
  }

  // 3. For each affected concept, fetch its observations and recalculate
  const deltas = [];

  for (const cId of affectedConceptSet) {
    const concept = conceptsById.get(cId);
    if (!concept) continue;

    const conceptKey = concept.normalizedName || concept.name.toLowerCase().trim();

    // Fetch all observations for this user and concept (also matches durable conceptKey)
    const observations = await ctx.db
      .query("learnerObservations")
      .withIndex("by_user_concept", (q) => q.eq("userId", userId).eq("conceptId", cId))
      .collect();

    // Check existing state for before/after comparison
    const existingState = await ctx.db
      .query("learnerConceptStates")
      .withIndex("by_user_concept", (q) => q.eq("userId", userId).eq("conceptId", cId))
      .unique();

    const beforeMastery = existingState ? existingState.masteryProbability : 0.0;

    let totalAttempts = 0;
    let correctAttempts = 0;
    let partialAttempts = 0;
    let incorrectAttempts = 0;
    let unansweredAttempts = 0;

    const diffExposure = { easy: 0, medium: 0, hard: 0 };
    let weightedSum = 0;
    let weightSum = 0;

    let firstObservedAt = null;
    let lastObservedAt = null;

    const sortedObs = [...observations].sort((a, b) => a.timestamp - b.timestamp);

    for (const obs of sortedObs) {
      totalAttempts++;
      if (obs.correctness === "correct") correctAttempts++;
      else if (obs.correctness === "partial") partialAttempts++;
      else if (obs.correctness === "incorrect") incorrectAttempts++;
      else if (obs.correctness === "unanswered") unansweredAttempts++;

      if (diffExposure[obs.difficulty] !== undefined) {
        diffExposure[obs.difficulty]++;
      }

      const recency = calculateRecencyWeight(obs.timestamp, now);
      const effectiveWeight = obs.weight * recency;

      weightedSum += obs.scoreFraction * effectiveWeight;
      weightSum += effectiveWeight;

      if (!firstObservedAt || obs.timestamp < firstObservedAt) firstObservedAt = obs.timestamp;
      if (!lastObservedAt || obs.timestamp > lastObservedAt) lastObservedAt = obs.timestamp;
    }

    const evidenceCount = observations.length;
    let masteryProbability = 0.0;
    let weightedScore = 0.0;

    if (weightSum > 0) {
      weightedScore = Math.round((weightedSum / weightSum) * 1000) / 1000;
      masteryProbability = Math.min(1.0, Math.max(0.0, weightedScore));
    }

    // Recent performance: average of latest up to 3 observations
    let recentScore = 0.0;
    if (evidenceCount > 0) {
      const recentSlice = sortedObs.slice(-3);
      recentScore =
        Math.round(
          (recentSlice.reduce((sum, o) => sum + o.scoreFraction, 0) / recentSlice.length) * 1000
        ) / 1000;
    }

    // Confidence & Trend
    const confidenceData = calculateConfidence(sortedObs);
    const trendData = calculateTrend(sortedObs);
    const masteryBand = determineMasteryBand(masteryProbability, evidenceCount, confidenceData.level);

    // Save or update concept state
    const stateFields = {
      userId,
      courseId,
      conceptId: cId,
      conceptKey,
      conceptName: concept.name,
      importance: concept.importance || "supporting",
      conceptType: concept.type || "concept",
      masteryProbability,
      masteryBand,
      confidence: confidenceData.level,
      confidenceScore: confidenceData.score,
      evidenceCount,
      totalAttempts,
      correctAttempts,
      partialAttempts,
      incorrectAttempts,
      unansweredAttempts,
      weightedScore,
      recentScore,
      difficultyExposure: diffExposure,
      lastObservedAt,
      firstObservedAt,
      trend: trendData.trend,
      trendDelta: trendData.delta,
      isArchived: false,
      modelVersion: MODEL_VERSION,
      updatedAt: now,
    };

    if (existingState) {
      await ctx.db.patch(existingState._id, stateFields);
    } else {
      await ctx.db.insert("learnerConceptStates", stateFields);
    }

    deltas.push({
      conceptId: cId,
      conceptName: concept.name,
      before: Math.round(beforeMastery * 100),
      after: Math.round(masteryProbability * 100),
      delta: Math.round((masteryProbability - beforeMastery) * 100),
      masteryBand,
      confidence: confidenceData.level,
      evidenceCount,
    });
  }

  // 4. Update prerequisite readiness for all active concepts in the course
  const allStates = await ctx.db
    .query("learnerConceptStates")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();

  const statesByConceptId = new Map();
  for (const s of allStates) {
    statesByConceptId.set(s.conceptId, s);
  }

  for (const state of allStates) {
    const prereqIds = prereqsByConceptId.get(state.conceptId) || [];
    if (prereqIds.length === 0) {
      await ctx.db.patch(state._id, {
        readiness: "not_applicable",
        prerequisiteCount: 0,
        prerequisitesSummary: [],
      });
      continue;
    }

    const summary = [];
    let hasWeakPrereq = false;
    let allReady = true;

    for (const pid of prereqIds) {
      const pConcept = conceptsById.get(pid);
      const pState = statesByConceptId.get(pid);
      const pMastery = pState ? pState.masteryProbability : 0.0;
      const pBand = pState ? pState.masteryBand : "insufficient_evidence";

      summary.push({
        conceptId: pid,
        conceptName: pConcept?.name || "Prerequisite",
        mastery: Math.round(pMastery * 100),
        masteryBand: pBand,
      });

      if (pBand === "needs_attention") {
        hasWeakPrereq = true;
      }
      if (pMastery < 0.60 || pBand === "insufficient_evidence") {
        allReady = false;
      }
    }

    let readiness = "developing";
    if (hasWeakPrereq) {
      readiness = "needs_attention";
    } else if (allReady) {
      readiness = "ready";
    }

    await ctx.db.patch(state._id, {
      readiness,
      prerequisiteCount: prereqIds.length,
      prerequisitesSummary: summary,
    });
  }

  return deltas;
}

/**
 * Calculates overall course mastery and assessment coverage.
 */
async function computeCourseSummary(ctx, userId, courseId) {
  const activeConcepts = await ctx.db
    .query("courseConcepts")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();

  const totalConceptCount = activeConcepts.length;

  const conceptStates = await ctx.db
    .query("learnerConceptStates")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .filter((q) => q.neq(q.field("isArchived"), true))
    .collect();

  let observedCount = 0;
  let weightedMasterySum = 0;
  let totalImportanceWeight = 0;
  let confidenceScoreSum = 0;

  let strongCount = 0;
  let proficientCount = 0;
  let developingCount = 0;
  let needsAttentionCount = 0;
  let notAssessedCount = 0;

  const stateByConceptId = new Map();
  for (const s of conceptStates) {
    stateByConceptId.set(s.conceptId, s);
  }

  for (const concept of activeConcepts) {
    const s = stateByConceptId.get(concept._id);
    const impWeight = IMPORTANCE_WEIGHTS[concept.importance] || 1.0;

    if (!s || s.evidenceCount === 0 || s.masteryBand === "insufficient_evidence") {
      notAssessedCount++;
    } else {
      observedCount++;
      weightedMasterySum += s.masteryProbability * impWeight;
      totalImportanceWeight += impWeight;
      confidenceScoreSum += s.confidenceScore;

      if (s.masteryBand === "strong") strongCount++;
      else if (s.masteryBand === "proficient") proficientCount++;
      else if (s.masteryBand === "developing") developingCount++;
      else if (s.masteryBand === "needs_attention") needsAttentionCount++;
    }
  }

  const coverage = totalConceptCount > 0 ? Math.round((observedCount / totalConceptCount) * 100) : 0;
  const overallMastery =
    totalImportanceWeight > 0 ? Math.round((weightedMasterySum / totalImportanceWeight) * 100) : 0;

  const averageConfidenceScore = observedCount > 0 ? confidenceScoreSum / observedCount : 0.0;
  let averageConfidence = "low";
  if (averageConfidenceScore >= 0.70) averageConfidence = "high";
  else if (averageConfidenceScore >= 0.35) averageConfidence = "medium";
  else if (observedCount === 0) averageConfidence = "insufficient";

  return {
    totalConceptCount,
    observedConceptCount: observedCount,
    coverage,
    overallMastery,
    averageConfidence,
    averageConfidenceScore: Math.round(averageConfidenceScore * 100) / 100,
    bands: {
      strong: strongCount,
      proficient: proficientCount,
      developing: developingCount,
      needsAttention: needsAttentionCount,
      notAssessed: notAssessedCount,
    },
  };
}

// ==========================================
// MUTATIONS
// ==========================================

export async function processAttemptGradedHelper(ctx, args) {
  const attempt = await ctx.db.get(args.attemptId);
  if (!attempt || attempt.status !== "graded") {
    return { success: false, reason: "Attempt is not in graded state." };
  }

  const assessment = await ctx.db.get(attempt.assessmentId);
  if (!assessment) return { success: false, reason: "Assessment not found." };

  const questions = await ctx.db
    .query("assessmentQuestions")
    .withIndex("by_assessment", (q) => q.eq("assessmentId", attempt.assessmentId))
    .collect();

  const responses = await ctx.db
    .query("assessmentResponses")
    .withIndex("by_attempt", (q) => q.eq("attemptId", args.attemptId))
    .collect();

  const responsesByQuestion = new Map();
  for (const r of responses) {
    responsesByQuestion.set(r.questionId, r);
  }

  const allConcepts = await ctx.db
    .query("courseConcepts")
    .withIndex("by_course", (q) => q.eq("courseId", attempt.courseId))
    .collect();

  const conceptsById = new Map();
  for (const c of allConcepts) {
    conceptsById.set(c._id, c);
  }

  const affectedConceptIds = new Set();
  const timestamp = attempt.submittedAt || Date.now();

  // 1. Create or update learner observations for each question response
  for (const q of questions) {
    const resp = responsesByQuestion.get(q._id);
    if (!resp) continue;

    const scoreFraction =
      q.points > 0 ? Math.min(1.0, Math.max(0.0, (resp.awardedPoints || 0) / q.points)) : 0.0;

    let correctness = "incorrect";
    if (!resp.isAnswered) {
      correctness = "unanswered";
    } else if (scoreFraction >= 0.99) {
      correctness = "correct";
    } else if (scoreFraction > 0.0) {
      correctness = "partial";
    }

    const diffWeight = DIFFICULTY_WEIGHTS[q.difficulty] || 1.0;
    const typeWeight = QUESTION_TYPE_WEIGHTS[q.questionType] || 1.0;
    const conceptCount = Math.max(1, (q.conceptIds || []).length);
    const multiConceptWeight = 1.0 / conceptCount;

    const totalObservationWeight = Math.round(diffWeight * typeWeight * multiConceptWeight * 100) / 100;

    for (let i = 0; i < (q.conceptIds || []).length; i++) {
      const cId = q.conceptIds[i];
      const concept = conceptsById.get(cId);
      if (!concept) continue;

      affectedConceptIds.add(cId);
      const conceptKey = concept.normalizedName || concept.name.toLowerCase().trim();

      // Check for existing observation for idempotent regrading
      const existingObs = await ctx.db
        .query("learnerObservations")
        .withIndex("by_response_concept", (idx) =>
          idx.eq("responseId", resp._id).eq("conceptId", cId)
        )
        .unique();

      const obsData = {
        userId: attempt.userId,
        courseId: attempt.courseId,
        conceptId: cId,
        conceptKey,
        conceptName: concept.name,
        assessmentId: attempt.assessmentId,
        attemptId: args.attemptId,
        questionId: q._id,
        responseId: resp._id,
        questionType: q.questionType,
        difficulty: q.difficulty || "medium",
        scoreFraction,
        correctness,
        weight: totalObservationWeight,
        timestamp,
        modelVersion: MODEL_VERSION,
        createdAt: Date.now(),
      };

      if (existingObs) {
        await ctx.db.patch(existingObs._id, obsData);
      } else {
        await ctx.db.insert("learnerObservations", obsData);
      }
    }
  }

  // 2. Recompute states for affected concepts
  const deltas = await computeConceptStates(
    ctx,
    attempt.userId,
    attempt.courseId,
    Array.from(affectedConceptIds),
    timestamp
  );

  // 3. Compute course summary and record snapshot
  const summary = await computeCourseSummary(ctx, attempt.userId, attempt.courseId);

  const snapshotId = await ctx.db.insert("learnerMasterySnapshots", {
    userId: attempt.userId,
    courseId: attempt.courseId,
    attemptId: args.attemptId,
    assessmentTitle: assessment.title,
    overallMastery: summary.overallMastery,
    coverage: summary.coverage,
    observedConceptCount: summary.observedConceptCount,
    totalConceptCount: summary.totalConceptCount,
    reason: args.reason || "assessment_graded",
    conceptDeltas: deltas,
    timestamp,
  });

  return {
    success: true,
    snapshotId,
    deltas,
    summary,
  };
}

/**
 * Idempotently creates learner observations for a graded attempt,
 * updates affected concept states, and records a mastery snapshot.
 */
export const processAttemptGraded = mutation({
  args: {
    attemptId: v.id("assessmentAttempts"),
    reason: v.optional(v.string()), // "assessment_graded" | "recompute" | "backfill"
  },
  handler: async (ctx, args) => {
    return await processAttemptGradedHelper(ctx, args);
  },
});

/**
 * Recomputes the entire learner model for a course by processing all graded attempts idempotently.
 * Useful for data backfill and model migrations.
 */
export const recomputeCourseLearnerModel = mutation({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) throw new Error("Unauthorized");

    // Fetch all graded attempts for this user and course
    const gradedAttempts = await ctx.db
      .query("assessmentAttempts")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .filter((q) => q.eq(q.field("status"), "graded"))
      .collect();

    // Sort chronologically
    const sortedAttempts = gradedAttempts.sort(
      (a, b) => (a.submittedAt || a.startedAt) - (b.submittedAt || b.startedAt)
    );

    // Process each attempt idempotently
    for (const att of sortedAttempts) {
      await processAttemptGradedHelper(ctx, {
        attemptId: att._id,
        reason: "backfill",
      });
    }

    const summary = await computeCourseSummary(ctx, user._id, args.courseId);
    return {
      success: true,
      attemptsProcessed: sortedAttempts.length,
      summary,
    };
  },
});

export async function migrateConceptsHelper(ctx, args) {
  const newConceptByNormalized = new Map();
  for (const nc of args.newConcepts) {
    newConceptByNormalized.set(nc.normalizedName, nc);
  }

  // Fetch all learner concept states for the course
  const existingStates = await ctx.db
    .query("learnerConceptStates")
    .withIndex("by_user_course", (q) => q.eq("userId", args.userId).eq("courseId", args.courseId))
    .collect();

  for (const state of existingStates) {
    const match = newConceptByNormalized.get(state.conceptKey);
    if (match) {
      // Concept matched: update conceptId and unarchive if it was archived
      await ctx.db.patch(state._id, {
        conceptId: match.newId,
        conceptName: match.name,
        isArchived: false,
        updatedAt: Date.now(),
      });

      // Also update any observations pointing to the old concept ID
      const obs = await ctx.db
        .query("learnerObservations")
        .withIndex("by_user_concept_key", (q) =>
          q.eq("userId", args.userId).eq("courseId", args.courseId).eq("conceptKey", state.conceptKey)
        )
        .collect();

      for (const o of obs) {
        if (o.conceptId !== match.newId) {
          await ctx.db.patch(o._id, { conceptId: match.newId, conceptName: match.name });
        }
      }
    } else {
      // Concept was removed in graph rebuild: preserve learner history, mark as archived
      await ctx.db.patch(state._id, {
        isArchived: true,
        updatedAt: Date.now(),
      });
    }
  }

  return { success: true };
}

/**
 * Migrates learner concept states and observations when Knowledge Graph is rebuilt.
 * Preserves states with matching conceptKey, archives removed concepts.
 */
export const migrateConceptsOnGraphRebuild = mutation({
  args: {
    courseId: v.id("courses"),
    userId: v.id("users"),
    oldConceptMap: v.any(), // Map of oldId -> normalizedName
    newConcepts: v.array(
      v.object({
        newId: v.id("courseConcepts"),
        normalizedName: v.string(),
        name: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await migrateConceptsHelper(ctx, args);
  },
});

// ==========================================
// QUERIES
// ==========================================

/**
 * Returns overall progress metrics and summary for a course.
 */
export const getCourseLearnerSummary = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const summary = await computeCourseSummary(ctx, user._id, args.courseId);

    // Fetch recent snapshots for historical progress trend
    const snapshots = await ctx.db
      .query("learnerMasterySnapshots")
      .withIndex("by_user_course_time", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .order("asc")
      .take(20);

    return {
      ...summary,
      snapshots: snapshots.map((s) => ({
        timestamp: s.timestamp,
        overallMastery: s.overallMastery,
        coverage: s.coverage,
        assessmentTitle: s.assessmentTitle || "Assessment Graded",
      })),
    };
  },
});

/**
 * Returns all concept mastery states for a course (with filtering and sorting support).
 */
export const getCourseConceptStates = query({
  args: {
    courseId: v.id("courses"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const activeConcepts = await ctx.db
      .query("courseConcepts")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const states = await ctx.db
      .query("learnerConceptStates")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .collect();

    const stateByConceptId = new Map();
    for (const s of states) {
      if (args.includeArchived || !s.isArchived) {
        stateByConceptId.set(s.conceptId, s);
      }
    }

    // Merge active concepts with learner states
    return activeConcepts.map((concept) => {
      const state = stateByConceptId.get(concept._id);
      if (!state || state.evidenceCount === 0) {
        return {
          conceptId: concept._id,
          conceptName: concept.name,
          importance: concept.importance || "supporting",
          conceptType: concept.type || "concept",
          masteryProbability: 0.0,
          masteryBand: "insufficient_evidence",
          confidence: "insufficient",
          confidenceScore: 0.0,
          evidenceCount: 0,
          totalAttempts: 0,
          correctAttempts: 0,
          partialAttempts: 0,
          incorrectAttempts: 0,
          weightedScore: 0.0,
          recentScore: 0.0,
          trend: "insufficient_data",
          readiness: "not_applicable",
          isAssessed: false,
        };
      }

      return {
        conceptId: concept._id,
        conceptName: concept.name,
        importance: concept.importance || "supporting",
        conceptType: concept.type || "concept",
        masteryProbability: state.masteryProbability,
        masteryBand: state.masteryBand,
        confidence: state.confidence,
        confidenceScore: state.confidenceScore,
        evidenceCount: state.evidenceCount,
        totalAttempts: state.totalAttempts,
        correctAttempts: state.correctAttempts,
        partialAttempts: state.partialAttempts,
        incorrectAttempts: state.incorrectAttempts,
        weightedScore: state.weightedScore,
        recentScore: state.recentScore,
        difficultyExposure: state.difficultyExposure,
        trend: state.trend,
        trendDelta: state.trendDelta,
        readiness: state.readiness,
        prerequisiteCount: state.prerequisiteCount,
        prerequisitesSummary: state.prerequisitesSummary,
        lastObservedAt: state.lastObservedAt,
        isAssessed: true,
      };
    });
  },
});

/**
 * Returns inspectable details for a single concept: why this score, observation history, trend line.
 */
export const getConceptLearnerDetails = query({
  args: {
    courseId: v.id("courses"),
    conceptId: v.id("courseConcepts"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const concept = await ctx.db.get(args.conceptId);
    if (!concept || concept.courseId !== args.courseId) return null;

    const state = await ctx.db
      .query("learnerConceptStates")
      .withIndex("by_user_concept", (q) => q.eq("userId", user._id).eq("conceptId", args.conceptId))
      .unique();

    // Fetch observation history
    const observations = await ctx.db
      .query("learnerObservations")
      .withIndex("by_user_concept", (q) => q.eq("userId", user._id).eq("conceptId", args.conceptId))
      .collect();

    // Fetch assessment names for observations
    const assessmentsMap = new Map();
    for (const obs of observations) {
      if (!assessmentsMap.has(obs.assessmentId)) {
        const ass = await ctx.db.get(obs.assessmentId);
        assessmentsMap.set(obs.assessmentId, ass?.title || "Assessment");
      }
    }

    const sortedObs = observations
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((o) => ({
        id: o._id,
        assessmentTitle: assessmentsMap.get(o.assessmentId),
        questionType: o.questionType,
        difficulty: o.difficulty,
        scoreFraction: o.scoreFraction,
        percentage: Math.round(o.scoreFraction * 100),
        correctness: o.correctness,
        timestamp: o.timestamp,
      }));

    // Deterministic "Why this score?" explanation
    let explanationText = "";
    if (!state || state.evidenceCount === 0) {
      explanationText = "This concept has not yet been evaluated in any graded assessment.";
    } else {
      const parts = [];
      parts.push(
        `Based on ${state.evidenceCount} graded question response${state.evidenceCount > 1 ? "s" : ""}: ` +
          `${state.correctAttempts} correct, ${state.partialAttempts} partial, and ${state.incorrectAttempts} incorrect.`
      );

      const exp = state.difficultyExposure || { easy: 0, medium: 0, hard: 0 };
      parts.push(
        `Difficulty distribution: ${exp.easy} easy, ${exp.medium} medium, and ${exp.hard} hard questions.`
      );

      if (state.evidenceCount < 3) {
        parts.push("Confidence is low because minimum evidence threshold (3 questions) has not yet been met.");
      } else if (state.confidence === "high") {
        parts.push("Confidence is high due to consistent performance across multiple difficulty levels.");
      } else if (state.confidence === "medium") {
        parts.push("Confidence is medium with consistent performance across recent attempts.");
      }

      if (state.trend === "improving") {
        parts.push("Recent performance shows an upward trajectory compared to initial attempts.");
      } else if (state.trend === "declining") {
        parts.push("Recent attempts show a decline compared to previous performance.");
      }

      explanationText = parts.join(" ");
    }

    return {
      concept,
      state,
      explanationText,
      observations: sortedObs,
    };
  },
});

/**
 * Returns learner model deltas for a specific attempt (used on the assessment results page).
 */
export const getAttemptLearnerDeltas = query({
  args: {
    attemptId: v.id("assessmentAttempts"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.userId !== user._id) return null;

    const snapshot = await ctx.db
      .query("learnerMasterySnapshots")
      .withIndex("by_attempt", (q) => q.eq("attemptId", args.attemptId))
      .unique();

    if (!snapshot) return null;

    return {
      attemptId: args.attemptId,
      overallMastery: snapshot.overallMastery,
      coverage: snapshot.coverage,
      conceptDeltas: snapshot.conceptDeltas || [],
    };
  },
});
