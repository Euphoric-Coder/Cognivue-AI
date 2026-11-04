import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./courses";

/**
 * Normalizes an incorrect claim or distractor into a stable misconception key.
 */
function normalizeMisconceptionKey(text, conceptKey) {
  const clean = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("_");
  
  if (!clean) return `${conceptKey || "concept"}_general_misconception`;
  return `${conceptKey ? conceptKey + "_" : ""}${clean}`;
}

/**
 * Calculates misconception confidence from evidence count.
 */
function calculateMisconceptionConfidence(evidenceCount) {
  if (evidenceCount >= 3) {
    return { confidence: "high", confidenceScore: 0.9 };
  } else if (evidenceCount === 2) {
    return { confidence: "medium", confidenceScore: 0.7 };
  }
  return { confidence: "low", confidenceScore: 0.4 };
}

/**
 * Extracts and records misconceptions from a graded assessment attempt.
 * Misconceptions come strictly from observed errors:
 * 1. Wrong MCQ distractor patterns (tagged misconception keys)
 * 2. Graded short-answer incorrectClaims
 */
export async function recordMisconceptionsFromAttemptHelper(ctx, attemptId) {
  const attempt = await ctx.db.get(attemptId);
  if (!attempt || attempt.status !== "graded") return { recorded: 0 };

  const questions = await ctx.db
    .query("assessmentQuestions")
    .withIndex("by_assessment", (q) => q.eq("assessmentId", attempt.assessmentId))
    .collect();

  const responses = await ctx.db
    .query("assessmentResponses")
    .withIndex("by_attempt", (q) => q.eq("attemptId", attemptId))
    .collect();

  const questionsById = new Map();
  for (const q of questions) {
    questionsById.set(q._id, q);
  }

  const allConcepts = await ctx.db
    .query("courseConcepts")
    .withIndex("by_course", (q) => q.eq("courseId", attempt.courseId))
    .collect();

  const conceptsById = new Map();
  for (const c of allConcepts) {
    conceptsById.set(c._id, c);
  }

  let recordedCount = 0;
  const now = Date.now();

  for (const resp of responses) {
    const question = questionsById.get(resp.questionId);
    if (!question) continue;

    const targetConcept = (question.conceptIds || [])[0]
      ? conceptsById.get(question.conceptIds[0])
      : null;
    const conceptId = targetConcept?._id || null;
    const conceptName = targetConcept?.name || null;
    const conceptKey = targetConcept?.normalizedName || targetConcept?.name?.toLowerCase().replace(/\s+/g, "_") || "concept";

    // 1. Check for incorrectClaims in short_answer or concept_explanation
    if (resp.incorrectClaims && Array.isArray(resp.incorrectClaims) && resp.incorrectClaims.length > 0) {
      for (const claim of resp.incorrectClaims) {
        if (!claim || typeof claim !== "string" || !claim.trim()) continue;

        const misconceptionKey = normalizeMisconceptionKey(claim, conceptKey);
        const description = claim.trim();

        // Check if this misconception already exists for user & course
        const existing = await ctx.db
          .query("learnerMisconceptions")
          .withIndex("by_user_course_key", (q) =>
            q.eq("userId", attempt.userId)
              .eq("courseId", attempt.courseId)
              .eq("misconceptionKey", misconceptionKey)
          )
          .unique();

        if (existing) {
          const respIdStr = resp._id.toString();
          if (!existing.sourceResponseIds.includes(respIdStr)) {
            const newCount = existing.evidenceCount + 1;
            const conf = calculateMisconceptionConfidence(newCount);
            await ctx.db.patch(existing._id, {
              evidenceCount: newCount,
              confidence: conf.confidence,
              confidenceScore: conf.confidenceScore,
              lastObservedAt: now,
              active: true,
              sourceResponseIds: [...existing.sourceResponseIds, respIdStr],
              updatedAt: now,
            });
            recordedCount++;
          }
        } else {
          const conf = calculateMisconceptionConfidence(1);
          await ctx.db.insert("learnerMisconceptions", {
            userId: attempt.userId,
            courseId: attempt.courseId,
            conceptId: conceptId || undefined,
            conceptName: conceptName || undefined,
            misconceptionKey,
            description,
            evidenceCount: 1,
            confidence: conf.confidence,
            confidenceScore: conf.confidenceScore,
            firstObservedAt: now,
            lastObservedAt: now,
            active: true,
            sourceResponseIds: [resp._id.toString()],
            updatedAt: now,
          });
          recordedCount++;
        }
      }
    }

    // 2. Check for distractor misconceptions on MCQ / multiple_select
    if (question.questionType === "mcq" || question.questionType === "multiple_select") {
      let selectedIndices = [];
      if (typeof resp.userAnswer === "number") {
        selectedIndices = [resp.userAnswer];
      } else if (Array.isArray(resp.userAnswer)) {
        selectedIndices = resp.userAnswer.filter((idx) => typeof idx === "number");
      }

      // Check question.distractorMisconceptions
      if (question.distractorMisconceptions && Array.isArray(question.distractorMisconceptions)) {
        for (const dm of question.distractorMisconceptions) {
          if (selectedIndices.includes(dm.optionIndex)) {
            const misconceptionKey = dm.misconceptionKey || normalizeMisconceptionKey(dm.description, conceptKey);
            const description = dm.description || `Selected misconception distractor on ${conceptName || "concept"}`;

            const existing = await ctx.db
              .query("learnerMisconceptions")
              .withIndex("by_user_course_key", (q) =>
                q.eq("userId", attempt.userId)
                  .eq("courseId", attempt.courseId)
                  .eq("misconceptionKey", misconceptionKey)
              )
              .unique();

            const respIdStr = resp._id.toString();
            if (existing) {
              if (!existing.sourceResponseIds.includes(respIdStr)) {
                const newCount = existing.evidenceCount + 1;
                const conf = calculateMisconceptionConfidence(newCount);
                await ctx.db.patch(existing._id, {
                  evidenceCount: newCount,
                  confidence: conf.confidence,
                  confidenceScore: conf.confidenceScore,
                  lastObservedAt: now,
                  active: true,
                  sourceResponseIds: [...existing.sourceResponseIds, respIdStr],
                  updatedAt: now,
                });
                recordedCount++;
              }
            } else {
              const conf = calculateMisconceptionConfidence(1);
              await ctx.db.insert("learnerMisconceptions", {
                userId: attempt.userId,
                courseId: attempt.courseId,
                conceptId: conceptId || undefined,
                conceptName: conceptName || undefined,
                misconceptionKey,
                description,
                evidenceCount: 1,
                confidence: conf.confidence,
                confidenceScore: conf.confidenceScore,
                firstObservedAt: now,
                lastObservedAt: now,
                active: true,
                sourceResponseIds: [respIdStr],
                updatedAt: now,
              });
              recordedCount++;
            }
          }
        }
      }

      // Check if options are objects with misconceptionKey
      if (question.options && Array.isArray(question.options)) {
        for (const idx of selectedIndices) {
          const opt = question.options[idx];
          if (opt && typeof opt === "object" && opt.misconceptionKey) {
            const misconceptionKey = opt.misconceptionKey;
            const description = `Selected distractor: ${opt.text || opt.misconceptionKey}`;

            const existing = await ctx.db
              .query("learnerMisconceptions")
              .withIndex("by_user_course_key", (q) =>
                q.eq("userId", attempt.userId)
                  .eq("courseId", attempt.courseId)
                  .eq("misconceptionKey", misconceptionKey)
              )
              .unique();

            const respIdStr = resp._id.toString();
            if (existing) {
              if (!existing.sourceResponseIds.includes(respIdStr)) {
                const newCount = existing.evidenceCount + 1;
                const conf = calculateMisconceptionConfidence(newCount);
                await ctx.db.patch(existing._id, {
                  evidenceCount: newCount,
                  confidence: conf.confidence,
                  confidenceScore: conf.confidenceScore,
                  lastObservedAt: now,
                  active: true,
                  sourceResponseIds: [...existing.sourceResponseIds, respIdStr],
                  updatedAt: now,
                });
                recordedCount++;
              }
            } else {
              const conf = calculateMisconceptionConfidence(1);
              await ctx.db.insert("learnerMisconceptions", {
                userId: attempt.userId,
                courseId: attempt.courseId,
                conceptId: conceptId || undefined,
                conceptName: conceptName || undefined,
                misconceptionKey,
                description,
                evidenceCount: 1,
                confidence: conf.confidence,
                confidenceScore: conf.confidenceScore,
                firstObservedAt: now,
                lastObservedAt: now,
                active: true,
                sourceResponseIds: [respIdStr],
                updatedAt: now,
              });
              recordedCount++;
            }
          }
        }
      }
    }

    // 3. Misconception resolution:
    // If the student answers a question on this concept correctly (100% points),
    // and there are active misconceptions on this concept, check if we should resolve or decay them.
    if (resp.isCorrect && targetConcept) {
      const activeConceptMisconceptions = await ctx.db
        .query("learnerMisconceptions")
        .withIndex("by_user_course_active", (q) =>
          q.eq("userId", attempt.userId)
            .eq("courseId", attempt.courseId)
            .eq("active", true)
        )
        .filter((q) => q.eq(q.field("conceptId"), targetConcept._id))
        .collect();

      for (const m of activeConceptMisconceptions) {
        // If evidence count is low (1 observation) and student gets it right now, deactivate
        if (m.evidenceCount <= 1) {
          await ctx.db.patch(m._id, {
            active: false,
            confidence: "low",
            confidenceScore: 0.2,
            updatedAt: now,
          });
        }
      }
    }
  }

  return { recorded: recordedCount };
}

/**
 * Mutation: Record misconceptions from a specific assessment attempt.
 */
export const recordMisconceptionsFromAssessmentAttempt = mutation({
  args: {
    attemptId: v.id("assessmentAttempts"),
  },
  handler: async (ctx, args) => {
    return await recordMisconceptionsFromAttemptHelper(ctx, args.attemptId);
  },
});

/**
 * Mutation: Backfills misconceptions from all historical graded attempts for a course.
 * Fully idempotent.
 */
export const backfillMisconceptions = mutation({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const attempts = await ctx.db
      .query("assessmentAttempts")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId)
      )
      .filter((q) => q.eq(q.field("status"), "graded"))
      .collect();

    let totalRecorded = 0;
    for (const att of attempts) {
      const res = await recordMisconceptionsFromAttemptHelper(ctx, att._id);
      totalRecorded += res.recorded;
    }

    return {
      success: true,
      attemptsProcessed: attempts.length,
      totalMisconceptionsRecorded: totalRecorded,
    };
  },
});

/**
 * Query: Get learner misconceptions for a course.
 */
export const getLearnerMisconceptions = query({
  args: {
    courseId: v.id("courses"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    let q = ctx.db
      .query("learnerMisconceptions")
      .withIndex("by_user_course", (idx) =>
        idx.eq("userId", user._id).eq("courseId", args.courseId)
      );

    const misconceptions = await q.collect();
    if (args.activeOnly) {
      return misconceptions.filter((m) => m.active);
    }
    return misconceptions;
  },
});

/**
 * Query: Securely retrieves verified context for Review with Tutor.
 * Resolves question, student response, correct answer, rubric, and concept details
 * from trusted database IDs rather than client-sent copies.
 */
export const getReviewAssessmentContext = query({
  args: {
    questionId: v.id("assessmentQuestions"),
    responseId: v.optional(v.id("assessmentResponses")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    // Course authorization check
    const course = await ctx.db.get(question.courseId);
    if (!course || course.userId !== user._id) {
      throw new Error("Unauthorized access to assessment question");
    }

    let response = null;
    if (args.responseId) {
      response = await ctx.db.get(args.responseId);
      if (response && response.userId !== user._id) {
        throw new Error("Unauthorized access to assessment response");
      }
    } else {
      // Find latest response for this question and user
      response = await ctx.db
        .query("assessmentResponses")
        .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
        .filter((q) => q.eq(q.field("userId"), user._id))
        .order("desc")
        .first();
    }

    // Fetch concept details
    const concepts = [];
    for (const cId of question.conceptIds || []) {
      const c = await ctx.db.get(cId);
      if (c) {
        concepts.push({
          id: c._id,
          name: c.name,
          description: c.description || "",
          importance: c.importance,
        });
      }
    }

    return {
      questionId: question._id,
      assessmentId: question.assessmentId,
      courseId: question.courseId,
      questionText: question.questionText,
      questionType: question.questionType,
      options: question.options,
      correctAnswer: question.correctAnswer,
      acceptedAnswers: question.acceptedAnswers,
      explanation: question.explanation,
      points: question.points,
      difficulty: question.difficulty,
      sourceEvidence: question.sourceEvidence,
      concepts,

      // Response details
      responseId: response?._id || null,
      userAnswer: response?.userAnswer ?? null,
      isCorrect: response?.isCorrect ?? false,
      awardedPoints: response?.awardedPoints ?? 0,
      feedback: response?.feedback ?? null,
      incorrectClaims: response?.incorrectClaims || [],
      matchedKeyPoints: response?.matchedKeyPoints || [],
      missingKeyPoints: response?.missingKeyPoints || [],
    };
  },
});

/**
 * Mutation: Records a structured tutor adaptation event for diagnostics and audit.
 */
export const recordAdaptationEvent = mutation({
  args: {
    sessionId: v.id("tutorSessions"),
    courseId: v.id("courses"),
    messageId: v.optional(v.union(v.id("tutorMessages"), v.string(), v.null())),
    conceptIds: v.array(v.string()),
    conceptNames: v.array(v.string()),
    masteryBand: v.string(),
    confidence: v.string(),
    strategy: v.string(),
    tutorMode: v.string(),
    prerequisiteIntervention: v.boolean(),
    misconceptionIntervention: v.boolean(),
    hintLevel: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    return await ctx.db.insert("tutorAdaptationEvents", {
      userId: session.userId,
      courseId: args.courseId,
      sessionId: args.sessionId,
      messageId: args.messageId || null,
      conceptIds: args.conceptIds,
      conceptNames: args.conceptNames,
      masteryBand: args.masteryBand,
      confidence: args.confidence,
      strategy: args.strategy,
      tutorMode: args.tutorMode,
      prerequisiteIntervention: args.prerequisiteIntervention,
      misconceptionIntervention: args.misconceptionIntervention,
      hintLevel: args.hintLevel || null,
      createdAt: Date.now(),
    });
  },
});

/**
 * Query: Aggregates technical adaptation metrics for a course.
 */
export const getAdaptationMetrics = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;

    const events = await ctx.db
      .query("tutorAdaptationEvents")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId)
      )
      .collect();

    let adaptiveQueries = 0;
    let neutralFallbacks = 0;
    let prerequisiteInterventions = 0;
    let misconceptionInterventions = 0;
    let socraticTurns = 0;
    let hintRequests = 0;

    for (const evt of events) {
      if (evt.tutorMode === "adaptive") adaptiveQueries++;
      if (evt.masteryBand === "not_assessed" || evt.strategy === "neutral") neutralFallbacks++;
      if (evt.prerequisiteIntervention) prerequisiteInterventions++;
      if (evt.misconceptionIntervention) misconceptionInterventions++;
      if (evt.tutorMode === "socratic") socraticTurns++;
      if (evt.tutorMode === "hint") hintRequests++;
    }

    return {
      totalEvents: events.length,
      adaptiveQueries,
      neutralFallbacks,
      prerequisiteInterventions,
      misconceptionInterventions,
      socraticTurns,
      hintRequests,
    };
  },
});
