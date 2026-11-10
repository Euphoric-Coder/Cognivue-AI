import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getCurrentUser } from "./courses";

const RECOMMENDATION_VERSION = "study-v1";

/**
 * Standard review interval schedule (in days)
 */
const BASE_REVIEW_INTERVALS = {
  needs_attention: 1,
  developing: 3,
  proficient: 7,
  strong: 14,
  insufficient_evidence: 1,
};

const EXPANDED_INTERVALS = [1, 3, 7, 14, 30, 60];

function getNextExpandedInterval(currentDays) {
  for (const interval of EXPANDED_INTERVALS) {
    if (interval > currentDays) return interval;
  }
  return 60;
}

/**
 * Deterministic Priority Calculation (0 - 100)
 */
function calculateConceptPriority(concept, learnerState, activeMisconceptions, isPrereqForWeak, reviewState, examTargetDate, now = Date.now()) {
  let score = 0;
  const reasonCodes = [];
  const reasonDetails = {};

  const isCore = concept.importance === "core";
  const isSupporting = concept.importance === "supporting";

  // 1. Concept Importance (up to 10 pts)
  if (isCore) {
    score += 10;
    reasonCodes.push("CORE_CONCEPT");
  } else if (isSupporting) {
    score += 5;
  }

  // 2. Learner Mastery State
  const evidenceCount = learnerState?.evidenceCount || 0;
  const masteryBand = learnerState?.masteryBand || "insufficient_evidence";
  const mastery = learnerState?.masteryProbability ?? null;
  const confidence = learnerState?.confidence || "insufficient";

  if (evidenceCount === 0 || masteryBand === "insufficient_evidence") {
    // Unassessed concept (Section 8: Label "Not Assessed", NOT "Weak")
    score += isCore ? 25 : 15;
    reasonCodes.push("NOT_ASSESSED");
    reasonDetails.isUnassessed = true;
  } else if (masteryBand === "needs_attention") {
    score += 40;
    reasonCodes.push("LOW_MASTERY");
    reasonDetails.mastery = Math.round(mastery * 100);
    reasonDetails.masteryBand = "needs_attention";
  } else if (masteryBand === "developing") {
    score += 25;
    reasonCodes.push("DEVELOPING_MASTERY");
    reasonDetails.mastery = Math.round(mastery * 100);
    reasonDetails.masteryBand = "developing";
  } else if (masteryBand === "proficient") {
    score += 10;
    reasonDetails.mastery = Math.round(mastery * 100);
  } else if (masteryBand === "strong") {
    // Strong concept: default low priority
    score += 0;
    reasonDetails.mastery = Math.round(mastery * 100);
  }

  // 3. Confidence Adjustment
  if (confidence === "high" && (masteryBand === "needs_attention" || masteryBand === "developing")) {
    score += 10;
    reasonCodes.push("CONFIRMED_DEFICIENCY");
    reasonDetails.confidence = "high";
  } else if (confidence === "low" && evidenceCount > 0) {
    score += 3;
    reasonDetails.confidence = "low";
  }

  // 4. Recent Errors (up to 15 pts)
  const incorrectAttempts = learnerState?.incorrectAttempts || 0;
  const partialAttempts = learnerState?.partialAttempts || 0;
  const recentErrors = incorrectAttempts + partialAttempts;
  if (recentErrors >= 2) {
    score += 15;
    reasonCodes.push("RECENT_ERRORS");
    reasonDetails.recentErrors = recentErrors;
  } else if (recentErrors === 1) {
    score += 8;
    reasonCodes.push("RECENT_ERRORS");
    reasonDetails.recentErrors = 1;
  }

  // 5. Prerequisite Blocker (20 pts)
  if (isPrereqForWeak) {
    score += 20;
    reasonCodes.push("PREREQUISITE_BLOCKER");
    reasonDetails.isPrerequisiteBlocker = true;
  }

  // 6. Active Misconception (15 pts)
  const conceptMisconceptions = activeMisconceptions.filter(
    (m) => String(m.conceptId) === String(concept._id) || m.conceptName === concept.name
  );
  if (conceptMisconceptions.length > 0) {
    const hasHighConf = conceptMisconceptions.some((m) => m.confidence === "high");
    score += hasHighConf ? 15 : 10;
    reasonCodes.push("ACTIVE_MISCONCEPTION");
    reasonDetails.misconceptionCount = conceptMisconceptions.length;
    reasonDetails.misconceptionKey = conceptMisconceptions[0].misconceptionKey;
  }

  // 7. Spaced Review Due-ness (Section 7 & 23)
  let isDueForReview = false;
  if (reviewState && reviewState.nextReviewAt) {
    const diffMs = now - reviewState.nextReviewAt;
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays >= 3) {
      score += 20;
      isDueForReview = true;
      reasonCodes.push("DUE_FOR_REVIEW");
      reasonDetails.daysOverdue = diffDays;
    } else if (diffDays >= 0) {
      score += 15;
      isDueForReview = true;
      reasonCodes.push("DUE_FOR_REVIEW");
      reasonDetails.daysOverdue = diffDays;
    } else if (diffDays >= -2) {
      score += 5;
    }
  } else if (evidenceCount > 0 && learnerState?.lastObservedAt) {
    // Fallback: if no explicit review state but observed long ago
    const daysSinceObserved = Math.floor((now - learnerState.lastObservedAt) / (24 * 60 * 60 * 1000));
    const thresholdDays = BASE_REVIEW_INTERVALS[masteryBand] || 7;
    if (daysSinceObserved >= thresholdDays) {
      score += 15;
      isDueForReview = true;
      reasonCodes.push("DUE_FOR_REVIEW");
      reasonDetails.daysSinceObserved = daysSinceObserved;
    }
  }

  // 8. Exam Target Relevance
  if (examTargetDate) {
    const targetMs = new Date(examTargetDate).getTime();
    if (!isNaN(targetMs) && targetMs > now) {
      const daysToExam = Math.max(1, Math.ceil((targetMs - now) / (24 * 60 * 60 * 1000)));
      if (isCore && (masteryBand === "needs_attention" || masteryBand === "developing" || evidenceCount === 0)) {
        score += Math.min(15, Math.ceil(30 / daysToExam) * 5);
        reasonCodes.push("EXAM_PRIORITY");
        reasonDetails.daysToExam = daysToExam;
      }
    }
  }

  // Clamp 0 to 100
  const priorityScore = Math.min(100, Math.max(0, score));

  // Determine Priority Band
  let priorityBand = "low";
  if (priorityScore >= 75) priorityBand = "critical";
  else if (priorityScore >= 50) priorityBand = "high";
  else if (priorityScore >= 25) priorityBand = "medium";

  // Determine Recommendation Type
  let recommendationType = "learn";
  if (isPrereqForWeak) {
    recommendationType = "remediate_prerequisite";
  } else if (conceptMisconceptions.length > 0) {
    recommendationType = "address_misconception";
  } else if (isDueForReview) {
    recommendationType = "spaced_review";
  } else if (masteryBand === "needs_attention" || masteryBand === "developing") {
    recommendationType = evidenceCount >= 2 ? "practice" : "review";
  } else if (evidenceCount === 0) {
    recommendationType = "learn";
  } else if (masteryBand === "proficient" || masteryBand === "strong") {
    recommendationType = "review";
  }

  // Human-readable reason summary
  const reasonParts = [];
  if (evidenceCount === 0) {
    reasonParts.push("Core concept not yet assessed");
  } else if (mastery !== null) {
    reasonParts.push(`Mastery at ${Math.round(mastery * 100)}% (${masteryBand.replace(/_/g, " ")})`);
  }
  if (isPrereqForWeak) {
    reasonParts.push("Prerequisite blocking progress on dependent concepts");
  }
  if (conceptMisconceptions.length > 0) {
    reasonParts.push(`Active misconception detected: ${conceptMisconceptions[0].description || conceptMisconceptions[0].misconceptionKey}`);
  }
  if (recentErrors > 0) {
    reasonParts.push(`${recentErrors} recent assessment error${recentErrors === 1 ? "" : "s"}`);
  }
  if (isDueForReview) {
    reasonParts.push("Due for scheduled spaced review");
  }
  if (reasonParts.length === 0) {
    reasonParts.push("Regular curriculum progression");
  }

  const reasonSummary = reasonParts.join(" • ");

  return {
    priorityScore,
    priorityBand,
    recommendationType,
    reasonCodes,
    reasonSummary,
    reasonDetails,
  };
}

/**
 * Recomputes all study recommendations for a course and user.
 */
export async function recomputeRecommendationsHelper(ctx, userId, courseId, examTargetDate = null) {
  const now = Date.now();

  // 1. Fetch concepts
  const concepts = await ctx.db
    .query("courseConcepts")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();

  if (concepts.length === 0) return { count: 0 };

  const conceptsById = new Map();
  for (const c of concepts) {
    conceptsById.set(c._id, c);
  }

  // 2. Fetch learner states
  const learnerStates = await ctx.db
    .query("learnerConceptStates")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();

  const statesByConceptId = new Map();
  for (const s of learnerStates) {
    statesByConceptId.set(s.conceptId, s);
  }

  // 3. Fetch relationships (prerequisites)
  const rels = await ctx.db
    .query("conceptRelationships")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();

  // Map: conceptId -> list of downstream conceptIds it is a prerequisite for
  const prereqForMap = new Map();
  for (const r of rels) {
    if (r.relationType === "PREREQUISITE_OF" || r.relationType === "DEPENDS_ON") {
      const prereqId = r.relationType === "PREREQUISITE_OF" ? r.fromConceptId : r.toConceptId;
      const dependentId = r.relationType === "PREREQUISITE_OF" ? r.toConceptId : r.fromConceptId;
      if (!prereqForMap.has(prereqId)) {
        prereqForMap.set(prereqId, []);
      }
      prereqForMap.get(prereqId).push(dependentId);
    }
  }

  // Determine which concepts are prerequisites for weak/developing downstream concepts
  const prereqForWeakSet = new Set();
  for (const [prereqId, dependentIds] of prereqForMap.entries()) {
    const prereqState = statesByConceptId.get(prereqId);
    const prereqMastery = prereqState?.masteryProbability ?? 0;
    // If prerequisite itself is developing or needs attention (< 0.70)
    if (prereqMastery < 0.70) {
      for (const depId of dependentIds) {
        const depState = statesByConceptId.get(depId);
        // If dependent concept is also weak/developing
        if ((depState?.masteryProbability ?? 0) < 0.70) {
          prereqForWeakSet.add(prereqId);
          break;
        }
      }
    }
  }

  // 4. Fetch active misconceptions
  const activeMisconceptions = await ctx.db
    .query("learnerMisconceptions")
    .withIndex("by_user_course_active", (q) => q.eq("userId", userId).eq("courseId", courseId).eq("active", true))
    .collect();

  // 5. Fetch review states
  const reviewStates = await ctx.db
    .query("conceptReviewStates")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();

  const reviewStateByConceptId = new Map();
  for (const rs of reviewStates) {
    reviewStateByConceptId.set(rs.conceptId, rs);
  }

  // 6. Fetch sources and visuals to recommend best supporting evidence
  const sources = await ctx.db
    .query("sources")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  const sourcesById = new Map();
  for (const s of sources) {
    sourcesById.set(s._id, s);
  }

  const visuals = await ctx.db
    .query("sourceVisuals")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();

  const visualsBySourceId = new Map();
  for (const v of visuals) {
    if (!visualsBySourceId.has(v.sourceId)) visualsBySourceId.set(v.sourceId, []);
    visualsBySourceId.get(v.sourceId).push(v);
  }

  // 7. Compute priority for each concept
  const recommendationsToPersist = [];

  for (const concept of concepts) {
    const learnerState = statesByConceptId.get(concept._id);
    const reviewState = reviewStateByConceptId.get(concept._id);
    const isPrereqForWeak = prereqForWeakSet.has(concept._id);

    const {
      priorityScore,
      priorityBand,
      recommendationType,
      reasonCodes,
      reasonSummary,
      reasonDetails,
    } = calculateConceptPriority(
      concept,
      learnerState,
      activeMisconceptions,
      isPrereqForWeak,
      reviewState,
      examTargetDate,
      now
    );

    // Recommend Best Supporting Evidence Source
    const recommendedSources = [];
    for (const source of sources) {
      if (source.status === "ready") {
        const sourceVisualList = visualsBySourceId.get(source._id) || [];
        let evidenceReason = `Primary ${source.type.toUpperCase()} course material covering this concept`;
        let modality = source.type;

        if (source.type === "video" && source.durationSeconds) {
          evidenceReason = `Lecture video segment explaining ${concept.name}`;
          modality = "video";
        } else if (sourceVisualList.length > 0) {
          const diagram = sourceVisualList.find((v) => v.diagramCount || v.visualId?.includes("diagram"));
          if (diagram) {
            evidenceReason = `Contains explanatory diagram on slide/page ${diagram.pageNumber || diagram.slideNumber || 1}`;
            modality = "diagram";
          }
        }

        recommendedSources.push({
          sourceId: source._id,
          sourceName: source.name,
          locationType: source.type === "video" ? "timestamp" : (source.pageCount ? "page" : "slide"),
          modality,
          evidenceReason,
        });

        if (recommendedSources.length >= 2) break;
      }
    }

    // Recommend Assessment Config
    const questionDifficulty =
      (learnerState?.masteryProbability || 0) < 0.4
        ? "easy"
        : (learnerState?.masteryProbability || 0) < 0.7
        ? "medium"
        : "hard";

    const recommendedAssessmentConfig = {
      conceptIds: [concept._id],
      conceptNames: [concept.name],
      questionCount: 5,
      difficulty: questionDifficulty,
      mode: "practice",
      reason: `Targeted 5-question ${questionDifficulty} practice quiz to reinforce ${concept.name}`,
    };

    recommendationsToPersist.push({
      userId,
      courseId,
      conceptId: concept._id,
      conceptName: concept.name,
      conceptKey: concept.normalizedName,
      recommendationType,
      priorityScore,
      priorityBand,
      reasonCodes,
      reasonSummary,
      reasonDetails,
      recommendedSourceIds: recommendedSources,
      recommendedAssessmentConfig,
      dueAt: reviewState?.nextReviewAt || (now + (BASE_REVIEW_INTERVALS[learnerState?.masteryBand || "developing"] || 3) * 86400000),
      status: "active",
      recommendationVersion: RECOMMENDATION_VERSION,
      generatedAt: now,
      updatedAt: now,
    });
  }

  // 8. Fetch existing recommendations to update or insert
  const existingRecs = await ctx.db
    .query("studyRecommendations")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();

  const existingByConceptId = new Map();
  for (const er of existingRecs) {
    existingByConceptId.set(er.conceptId, er);
  }

  for (const rec of recommendationsToPersist) {
    const existing = existingByConceptId.get(rec.conceptId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        recommendationType: rec.recommendationType,
        priorityScore: rec.priorityScore,
        priorityBand: rec.priorityBand,
        reasonCodes: rec.reasonCodes,
        reasonSummary: rec.reasonSummary,
        reasonDetails: rec.reasonDetails,
        recommendedSourceIds: rec.recommendedSourceIds,
        recommendedAssessmentConfig: rec.recommendedAssessmentConfig,
        dueAt: rec.dueAt,
        status: existing.status === "dismissed" ? "dismissed" : "active",
        recommendationVersion: RECOMMENDATION_VERSION,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("studyRecommendations", rec);
    }
  }

  return {
    count: recommendationsToPersist.length,
    criticalCount: recommendationsToPersist.filter((r) => r.priorityBand === "critical").length,
    highCount: recommendationsToPersist.filter((r) => r.priorityBand === "high").length,
    mediumCount: recommendationsToPersist.filter((r) => r.priorityBand === "medium").length,
    lowCount: recommendationsToPersist.filter((r) => r.priorityBand === "low").length,
  };
}

// ==========================================
// QUERIES
// ==========================================

export const getStudyRecommendations = query({
  args: {
    courseId: v.id("courses"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const statusFilter = args.status || "active";

    const recs = await ctx.db
      .query("studyRecommendations")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", statusFilter)
      )
      .collect();

    // Sort by priorityScore descending
    return recs.sort((a, b) => b.priorityScore - a.priorityScore);
  },
});

export const getActiveStudyPlan = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const plan = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", "active")
      )
      .first();

    return plan;
  },
});

export const getStudyPlanItems = query({
  args: {
    studyPlanId: v.id("studyPlans"),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const plan = await ctx.db.get(args.studyPlanId);
    if (!plan || plan.userId !== user._id) return [];

    const items = await ctx.db
      .query("studyPlanItems")
      .withIndex("by_plan", (q) => q.eq("studyPlanId", args.studyPlanId))
      .collect();

    if (args.date) {
      return items
        .filter((it) => it.date === args.date)
        .sort((a, b) => (b.priority === "critical" ? 1 : 0) - (a.priority === "critical" ? 1 : 0));
    }

    return items.sort((a, b) => a.date.localeCompare(b.date));
  },
});

export const getTodayStudyPlan = query({
  args: {
    courseId: v.id("courses"),
    todayDate: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { plan: null, items: [] };

    const plan = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", "active")
      )
      .first();

    if (!plan) return { plan: null, items: [] };

    const allPlanItems = await ctx.db
      .query("studyPlanItems")
      .withIndex("by_plan", (q) => q.eq("studyPlanId", plan._id))
      .collect();

    // Include items for today + any overdue pending items from previous dates
    const todayItems = allPlanItems.filter(
      (it) => it.date === args.todayDate || (it.date < args.todayDate && it.status === "pending")
    );

    return {
      plan,
      items: todayItems.sort((a, b) => {
        const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
        return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
      }),
    };
  },
});

export const getDueReviews = query({
  args: {
    courseId: v.id("courses"),
    maxNextReviewAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const cutoff = args.maxNextReviewAt || Date.now();

    const states = await ctx.db
      .query("conceptReviewStates")
      .withIndex("by_user_course_next_review", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).lte("nextReviewAt", cutoff)
      )
      .collect();

    return states;
  },
});

export const getStudyOverview = query({
  args: {
    courseId: v.id("courses"),
    todayDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const now = Date.now();

    // 1. Recommendations
    const recs = await ctx.db
      .query("studyRecommendations")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", "active")
      )
      .collect();

    const highPriorityCount = recs.filter((r) => r.priorityBand === "critical" || r.priorityBand === "high").length;

    // 2. Due Reviews
    const dueReviews = await ctx.db
      .query("conceptReviewStates")
      .withIndex("by_user_course_next_review", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).lte("nextReviewAt", now)
      )
      .collect();

    // 3. Active Plan & Today's Items
    const plan = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", "active")
      )
      .first();

    let todayItemsCount = 0;
    let completedTodayCount = 0;
    let todayMinutes = 0;

    if (plan) {
      const planItems = await ctx.db
        .query("studyPlanItems")
        .withIndex("by_plan", (q) => q.eq("studyPlanId", plan._id))
        .collect();

      const itemsForToday = planItems.filter(
        (it) => it.date === args.todayDate || (it.date < args.todayDate && it.status === "pending")
      );

      todayItemsCount = itemsForToday.length;
      completedTodayCount = itemsForToday.filter((it) => it.status === "completed").length;
      todayMinutes = itemsForToday.reduce((acc, it) => acc + (it.durationMinutes || 0), 0);
    }

    return {
      totalRecommendations: recs.length,
      highPriorityCount,
      dueReviewsCount: dueReviews.length,
      todayMinutes: todayMinutes || plan?.dailyMinutes || 30,
      todayItemsCount,
      completedTodayCount,
      activePlan: plan || null,
    };
  },
});

export const getConceptStudyRecommendation = query({
  args: {
    courseId: v.id("courses"),
    conceptId: v.id("courseConcepts"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const rec = await ctx.db
      .query("studyRecommendations")
      .withIndex("by_user_concept", (q) => q.eq("userId", user._id).eq("conceptId", args.conceptId))
      .first();

    return rec || null;
  },
});

// ==========================================
// MUTATIONS
// ==========================================

export const recomputeStudyRecommendations = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Look for active plan target exam date if any
    const activePlan = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", "active")
      )
      .first();

    return await recomputeRecommendationsHelper(ctx, user._id, args.courseId, activePlan?.targetDate || null);
  },
});

export const saveStudyRecommendationsBackend = mutation({
  args: {
    courseId: v.id("courses"),
    userId: v.id("users"),
    recommendations: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const rec of args.recommendations) {
      const existing = await ctx.db
        .query("studyRecommendations")
        .withIndex("by_user_concept", (q) => q.eq("userId", args.userId).eq("conceptId", rec.conceptId))
        .first();

      const doc = {
        ...rec,
        userId: args.userId,
        courseId: args.courseId,
        status: rec.status || "active",
        recommendationVersion: RECOMMENDATION_VERSION,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, doc);
      } else {
        await ctx.db.insert("studyRecommendations", { ...doc, generatedAt: now });
      }
    }
    return { success: true, count: args.recommendations.length };
  },
});

export const saveStudyPlanBackend = mutation({
  args: {
    courseId: v.id("courses"),
    userId: v.id("users"),
    plan: v.any(),
    items: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Archive previous active plans
    const existingActive = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", args.userId).eq("courseId", args.courseId).eq("status", "active")
      )
      .collect();

    for (const ep of existingActive) {
      await ctx.db.patch(ep._id, { status: "archived", updatedAt: now });
    }

    // Insert new plan
    const planId = await ctx.db.insert("studyPlans", {
      userId: args.userId,
      courseId: args.courseId,
      title: args.plan.title,
      planType: args.plan.planType,
      startDate: args.plan.startDate,
      endDate: args.plan.endDate,
      targetDate: args.plan.targetDate || null,
      dailyMinutes: args.plan.dailyMinutes,
      preferredStudyDays: args.plan.preferredStudyDays || null,
      status: "active",
      examReadiness: args.plan.examReadiness || null,
      examReadinessDetails: args.plan.examReadinessDetails || null,
      generatedAt: now,
      updatedAt: now,
    });

    // Insert plan items
    for (const it of args.items) {
      await ctx.db.insert("studyPlanItems", {
        userId: args.userId,
        courseId: args.courseId,
        studyPlanId: planId,
        date: it.date,
        conceptId: it.conceptId || null,
        conceptName: it.conceptName || null,
        activityType: it.activityType,
        durationMinutes: it.durationMinutes,
        priority: it.priority,
        sourceId: it.sourceId || null,
        sourceDetails: it.sourceDetails || null,
        assessmentConfig: it.assessmentConfig || null,
        reason: it.reason,
        status: "pending",
        completedAt: null,
        createdAt: now,
      });
    }

    return { planId, itemsCount: args.items.length };
  },
});

/**
 * Marks study item complete.
 * CRITICAL INVARIANT (Section 37 & 38): Completion alone does NOT update V8 persistent mastery!
 * Only logs studyActivityEvents and updates spaced review scheduling.
 */
export const completeStudyPlanItem = mutation({
  args: {
    itemId: v.id("studyPlanItems"),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.userId !== user._id) throw new Error("Unauthorized or not found");

    const now = Date.now();
    const duration = args.durationSeconds || item.durationMinutes * 60;

    // 1. Mark item complete
    await ctx.db.patch(item._id, {
      status: "completed",
      completedAt: now,
    });

    // 2. Log activity event (Section 39)
    await ctx.db.insert("studyActivityEvents", {
      userId: user._id,
      courseId: item.courseId,
      conceptId: item.conceptId || null,
      activityType: item.activityType,
      sourceId: item.sourceId || null,
      studyPlanItemId: item._id,
      startedAt: now - duration * 1000,
      completedAt: now,
      durationSeconds: duration,
      createdAt: now,
    });

    // 3. If item had a concept, record spaced review state update (Section 26)
    if (item.conceptId) {
      const existingReview = await ctx.db
        .query("conceptReviewStates")
        .withIndex("by_user_concept", (q) => q.eq("userId", user._id).eq("conceptId", item.conceptId))
        .first();

      const currentInterval = existingReview?.reviewIntervalDays || 3;
      const nextInterval = getNextExpandedInterval(currentInterval);

      if (existingReview) {
        await ctx.db.patch(existingReview._id, {
          lastReviewedAt: now,
          nextReviewAt: now + nextInterval * 86400000,
          reviewIntervalDays: nextInterval,
          successfulReviews: (existingReview.successfulReviews || 0) + 1,
          lastReviewOutcome: "success",
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("conceptReviewStates", {
          userId: user._id,
          courseId: item.courseId,
          conceptId: item.conceptId,
          lastReviewedAt: now,
          nextReviewAt: now + nextInterval * 86400000,
          reviewIntervalDays: nextInterval,
          successfulReviews: 1,
          failedReviews: 0,
          lastReviewOutcome: "success",
          updatedAt: now,
        });
      }
    }

    return { success: true, completedAt: now };
  },
});

export const recordReviewEvent = mutation({
  args: {
    courseId: v.id("courses"),
    conceptId: v.id("courseConcepts"),
    outcome: v.string(), // "success" | "fail"
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("conceptReviewStates")
      .withIndex("by_user_concept", (q) => q.eq("userId", user._id).eq("conceptId", args.conceptId))
      .first();

    const isSuccess = args.outcome === "success";
    const currentInterval = existing?.reviewIntervalDays || 3;
    const nextInterval = isSuccess ? getNextExpandedInterval(currentInterval) : 1;

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastReviewedAt: now,
        nextReviewAt: now + nextInterval * 86400000,
        reviewIntervalDays: nextInterval,
        successfulReviews: (existing.successfulReviews || 0) + (isSuccess ? 1 : 0),
        failedReviews: (existing.failedReviews || 0) + (isSuccess ? 0 : 1),
        lastReviewOutcome: args.outcome,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("conceptReviewStates", {
        userId: user._id,
        courseId: args.courseId,
        conceptId: args.conceptId,
        lastReviewedAt: now,
        nextReviewAt: now + nextInterval * 86400000,
        reviewIntervalDays: nextInterval,
        successfulReviews: isSuccess ? 1 : 0,
        failedReviews: isSuccess ? 0 : 1,
        lastReviewOutcome: args.outcome,
        updatedAt: now,
      });
    }

    return { success: true, nextIntervalDays: nextInterval };
  },
});

export const dismissRecommendation = mutation({
  args: { recommendationId: v.id("studyRecommendations") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rec = await ctx.db.get(args.recommendationId);
    if (!rec || rec.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(rec._id, {
      status: "dismissed",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const rebalanceStudyPlan = mutation({
  args: {
    studyPlanId: v.id("studyPlans"),
    todayDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const plan = await ctx.db.get(args.studyPlanId);
    if (!plan || plan.userId !== user._id) throw new Error("Unauthorized");

    const items = await ctx.db
      .query("studyPlanItems")
      .withIndex("by_plan", (q) => q.eq("studyPlanId", plan._id))
      .collect();

    // Move pending items from previous dates to today
    let rebalancedCount = 0;
    for (const item of items) {
      if (item.date < args.todayDate && item.status === "pending") {
        await ctx.db.patch(item._id, {
          date: args.todayDate,
          status: "pending",
        });
        rebalancedCount++;
      }
    }

    return { success: true, rebalancedCount };
  },
});

export const updateStudyPlanSettings = mutation({
  args: {
    courseId: v.id("courses"),
    dailyMinutes: v.number(),
    preferredStudyDays: v.optional(v.array(v.string())),
    examDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const activePlan = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", "active")
      )
      .first();

    const now = Date.now();

    if (activePlan) {
      await ctx.db.patch(activePlan._id, {
        dailyMinutes: args.dailyMinutes,
        preferredStudyDays: args.preferredStudyDays || activePlan.preferredStudyDays,
        targetDate: args.examDate !== undefined ? args.examDate : activePlan.targetDate,
        updatedAt: now,
      });
      return { success: true, planId: activePlan._id };
    }

    return { success: false, message: "No active study plan to update" };
  },
});

/**
 * Direct Plan Generator Mutation: generates a full daily/weekly/exam plan from recommendations.
 */
export const generateStudyPlan = mutation({
  args: {
    courseId: v.id("courses"),
    planType: v.string(), // "daily" | "weekly" | "exam_preparation"
    dailyMinutes: v.number(),
    preferredStudyDays: v.optional(v.array(v.string())),
    targetDate: v.optional(v.union(v.string(), v.null())),
    todayDate: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    // 1. Recompute recommendations to have the latest
    await recomputeRecommendationsHelper(ctx, user._id, args.courseId, args.targetDate || null);

    // 2. Fetch top recommendations
    const recs = await ctx.db
      .query("studyRecommendations")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", "active")
      )
      .collect();

    const sortedRecs = recs.sort((a, b) => b.priorityScore - a.priorityScore);

    // 3. Determine plan duration and dates
    const daysToSchedule = args.planType === "daily" ? 1 : args.planType === "weekly" ? 7 : 14;
    const startDate = args.todayDate;
    const endDateObj = new Date(startDate);
    endDateObj.setDate(endDateObj.getDate() + daysToSchedule - 1);
    const endDate = endDateObj.toISOString().split("T")[0];

    // Archive previous active plan
    const previousPlans = await ctx.db
      .query("studyPlans")
      .withIndex("by_user_course_status", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId).eq("status", "active")
      )
      .collect();
    for (const p of previousPlans) {
      await ctx.db.patch(p._id, { status: "archived", updatedAt: now });
    }

    // Determine derived Exam Readiness (Section 61 & 62: early, developing, on_track, strong)
    let examReadiness = null;
    if (args.targetDate) {
      const coreRecs = sortedRecs.filter((r) => r.reasonCodes?.includes("CORE_CONCEPT"));
      const weakCore = coreRecs.filter((r) => r.priorityBand === "critical" || r.priorityBand === "high");
      if (coreRecs.length === 0 || weakCore.length > coreRecs.length * 0.5) {
        examReadiness = "early";
      } else if (weakCore.length > 0) {
        examReadiness = "developing";
      } else if (sortedRecs.some((r) => r.priorityBand === "critical")) {
        examReadiness = "on_track";
      } else {
        examReadiness = "strong";
      }
    }

    const title =
      args.planType === "daily"
        ? `Daily Focus (${args.dailyMinutes} min)`
        : args.planType === "weekly"
        ? `Weekly Study Schedule`
        : `Exam Preparation Plan`;

    const planId = await ctx.db.insert("studyPlans", {
      userId: user._id,
      courseId: args.courseId,
      title,
      planType: args.planType,
      startDate,
      endDate,
      targetDate: args.targetDate || null,
      dailyMinutes: args.dailyMinutes,
      preferredStudyDays: args.preferredStudyDays || null,
      status: "active",
      examReadiness,
      examReadinessDetails: args.targetDate ? { readiness: examReadiness, totalRecommendations: sortedRecs.length } : null,
      generatedAt: now,
      updatedAt: now,
    });

    // 4. Distribute activities into daily budgets
    let itemsCount = 0;
    const targetDays = Math.min(daysToSchedule, 14);

    for (let dayOffset = 0; dayOffset < targetDays; dayOffset++) {
      const dayDateObj = new Date(startDate);
      dayDateObj.setDate(dayDateObj.getDate() + dayOffset);
      const dayDateStr = dayDateObj.toISOString().split("T")[0];

      let remainingMinutes = args.dailyMinutes;
      let recIndex = (dayOffset * 2) % (sortedRecs.length || 1);

      // Select top 1-3 activities fitting remainingMinutes
      while (remainingMinutes >= 5 && sortedRecs.length > 0 && recIndex < sortedRecs.length) {
        const rec = sortedRecs[recIndex];
        recIndex++;

        // Choose appropriate activity
        let activityType = "review_source";
        let duration = Math.min(10, remainingMinutes);

        if (rec.recommendationType === "remediate_prerequisite") {
          activityType = "concept_revision";
          duration = Math.min(15, remainingMinutes);
        } else if (rec.recommendationType === "address_misconception") {
          activityType = "tutor_review";
          duration = Math.min(10, remainingMinutes);
        } else if (rec.recommendationType === "practice") {
          activityType = "practice_quiz";
          duration = Math.min(15, remainingMinutes);
        } else if (rec.recommendationType === "spaced_review") {
          activityType = "concept_revision";
          duration = Math.min(10, remainingMinutes);
        } else if (rec.recommendedSourceIds?.[0]?.modality === "video") {
          activityType = "watch_video";
          duration = Math.min(10, remainingMinutes);
        } else if (rec.recommendedSourceIds?.[0]?.modality === "diagram") {
          activityType = "review_visual";
          duration = Math.min(8, remainingMinutes);
        }

        if (duration < 5) break;

        const bestSource = rec.recommendedSourceIds?.[0] || null;

        await ctx.db.insert("studyPlanItems", {
          userId: user._id,
          courseId: args.courseId,
          studyPlanId: planId,
          date: dayDateStr,
          conceptId: rec.conceptId,
          conceptName: rec.conceptName,
          activityType,
          durationMinutes: duration,
          priority: rec.priorityBand,
          sourceId: bestSource ? bestSource.sourceId : null,
          sourceDetails: bestSource,
          assessmentConfig: rec.recommendedAssessmentConfig || null,
          reason: rec.reasonSummary,
          status: "pending",
          completedAt: null,
          createdAt: now,
        });

        itemsCount++;
        remainingMinutes -= duration;
      }
    }

    return {
      planId,
      itemsCount,
      title,
      planType: args.planType,
      examReadiness,
    };
  },
});

