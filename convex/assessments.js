import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { processAttemptGradedHelper } from "./learnerModel";

async function getCurrentUser(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

async function requireUser(ctx) {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export const getCourseAssessments = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) return [];

    const assessments = await ctx.db
      .query("assessments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    // Attach attempt count & best score for each assessment
    const results = await Promise.all(
      assessments.map(async (ass) => {
        const attempts = await ctx.db
          .query("assessmentAttempts")
          .withIndex("by_assessment", (q) => q.eq("assessmentId", ass._id))
          .collect();

        const completedAttempts = attempts.filter((a) => a.status === "graded" || a.status === "submitted");
        let bestPercentage = null;
        for (const a of completedAttempts) {
          if (a.percentage !== undefined && a.percentage !== null) {
            if (bestPercentage === null || a.percentage > bestPercentage) {
              bestPercentage = a.percentage;
            }
          }
        }

        return {
          ...ass,
          attemptCount: completedAttempts.length,
          bestPercentage,
          totalAttemptsCount: attempts.length,
        };
      })
    );

    return results.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getAssessment = query({
  args: { assessmentId: v.id("assessments") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.userId !== user._id) return null;

    const course = await ctx.db.get(assessment.courseId);

    // Get attempts summary
    const attempts = await ctx.db
      .query("assessmentAttempts")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();

    return {
      ...assessment,
      courseName: course?.name,
      attempts: attempts.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

export const getAssessmentQuestions = query({
  args: { assessmentId: v.id("assessments") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.userId !== user._id) return [];

    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();

    return questions.sort((a, b) => a.questionIndex - b.questionIndex);
  },
});

export const getAssessmentForAttempt = query({
  args: {
    assessmentId: v.id("assessments"),
    attemptId: v.id("assessmentAttempts"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.userId !== user._id) return null;

    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.userId !== user._id) return null;

    const rawQuestions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();

    const sortedQuestions = rawQuestions.sort((a, b) => a.questionIndex - b.questionIndex);

    // Fetch existing responses for this attempt
    const responses = await ctx.db
      .query("assessmentResponses")
      .withIndex("by_attempt", (q) => q.eq("attemptId", args.attemptId))
      .collect();

    const responsesByQuestion = {};
    for (const r of responses) {
      responsesByQuestion[r.questionId] = r;
    }

    // In Mock Exam mode while in-progress, strip correct answers and explanations to prevent client leakage
    const isMockExamInProgress = attempt.status === "in_progress" && (attempt.mode === "mock_exam" || assessment.assessmentType === "mock_exam");

    const sanitizedQuestions = sortedQuestions.map((q) => {
      if (isMockExamInProgress) {
        return {
          _id: q._id,
          assessmentId: q.assessmentId,
          questionIndex: q.questionIndex,
          questionType: q.questionType,
          questionText: q.questionText,
          options: q.options,
          points: q.points,
          difficulty: q.difficulty,
          conceptIds: q.conceptIds,
          conceptNames: q.conceptNames,
          sourceVisualId: q.sourceVisualId,
          sourceVisualUrl: q.sourceVisualUrl,
        };
      }
      return q;
    });

    return {
      assessment,
      attempt,
      questions: sanitizedQuestions,
      responsesByQuestion,
    };
  },
});

export const getAttempt = query({
  args: { attemptId: v.id("assessmentAttempts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.userId !== user._id) return null;

    const assessment = await ctx.db.get(attempt.assessmentId);
    return {
      attempt,
      assessment,
    };
  },
});

export const getAttemptResponses = query({
  args: { attemptId: v.id("assessmentAttempts") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.userId !== user._id) return null;

    const assessment = await ctx.db.get(attempt.assessmentId);

    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", attempt.assessmentId))
      .collect();

    const sortedQuestions = questions.sort((a, b) => a.questionIndex - b.questionIndex);

    const responses = await ctx.db
      .query("assessmentResponses")
      .withIndex("by_attempt", (q) => q.eq("attemptId", args.attemptId))
      .collect();

    const responsesByQuestion = {};
    for (const r of responses) {
      responsesByQuestion[r.questionId] = r;
    }

    const reviewItems = sortedQuestions.map((q) => {
      const resp = responsesByQuestion[q._id];
      return {
        question: q,
        response: resp || null,
        userAnswer: resp?.userAnswer ?? null,
        isAnswered: resp?.isAnswered ?? false,
        isCorrect: resp?.isCorrect ?? false,
        awardedPoints: resp?.awardedPoints ?? 0,
        maxPoints: resp?.maxPoints ?? q.points,
        feedback: resp?.feedback ?? null,
        matchedKeyPoints: resp?.matchedKeyPoints ?? [],
        missingKeyPoints: resp?.missingKeyPoints ?? [],
        incorrectClaims: resp?.incorrectClaims ?? [],
      };
    });

    return {
      attempt,
      assessment,
      reviewItems,
    };
  },
});

export const getCourseAssessmentMetrics = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) return null;

    const assessments = await ctx.db
      .query("assessments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const attempts = await ctx.db
      .query("assessmentAttempts")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const completedAttempts = attempts.filter((a) => a.status === "graded" || a.status === "submitted");

    let totalQuestionsGenerated = 0;
    for (const ass of assessments) {
      totalQuestionsGenerated += ass.generatedQuestionCount || 0;
    }

    let totalScoreSum = 0;
    for (const a of completedAttempts) {
      totalScoreSum += a.percentage || 0;
    }

    const averagePercentage = completedAttempts.length > 0
      ? Math.round(totalScoreSum / completedAttempts.length)
      : null;

    return {
      totalAssessments: assessments.length,
      totalQuestionsGenerated,
      completedAttemptsCount: completedAttempts.length,
      averagePercentage,
    };
  },
});

export const getCourseConceptsForAssessment = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) return [];

    const concepts = await ctx.db
      .query("courseConcepts")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    return concepts.sort((a, b) => {
      if (a.importance === "core" && b.importance !== "core") return -1;
      if (b.importance === "core" && a.importance !== "core") return 1;
      return b.evidenceCount - a.evidenceCount;
    });
  },
});

export const createAssessment = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    assessmentType: v.string(), // "practice" | "topic_quiz" | "mixed_quiz" | "mock_exam"
    selectedConceptIds: v.optional(v.union(v.array(v.id("courseConcepts")), v.null())),
    selectedConceptNames: v.optional(v.union(v.array(v.string()), v.null())),
    difficulty: v.string(), // "easy" | "medium" | "hard" | "mixed"
    questionCount: v.number(),
    questionTypeConfig: v.optional(
      v.union(
        v.array(v.string()),
        v.object({
          mcq: v.boolean(),
          multiple_select: v.boolean(),
          true_false: v.boolean(),
          short_answer: v.boolean(),
          numerical: v.boolean(),
          concept_explanation: v.boolean(),
        }),
        v.null()
      )
    ),
    timeLimitMinutes: v.optional(v.union(v.number(), v.null())),
    shuffleQuestions: v.optional(v.union(v.boolean(), v.null())),
    shuffleOptions: v.optional(v.union(v.boolean(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) throw new Error("Unauthorized");

    const assessmentId = await ctx.db.insert("assessments", {
      userId: user._id,
      courseId: args.courseId,
      title: args.title,
      description: args.description || undefined,
      assessmentType: args.assessmentType,
      status: "generating",
      selectedConceptIds: args.selectedConceptIds || [],
      selectedConceptNames: args.selectedConceptNames || undefined,
      difficulty: args.difficulty,
      questionCount: args.questionCount,
      questionTypeConfig: args.questionTypeConfig || undefined,
      timeLimitMinutes: args.timeLimitMinutes || undefined,
      shuffleQuestions: args.shuffleQuestions ?? true,
      shuffleOptions: args.shuffleOptions ?? true,
      courseSnapshotHash: course.sourceSnapshotHash,
      graphVersion: course.graphVersion || 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return assessmentId;
  },
});

export const updateAssessmentStatus = mutation({
  args: {
    assessmentId: v.id("assessments"),
    status: v.string(),
    error: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment) return;

    await ctx.db.patch(args.assessmentId, {
      status: args.status,
      error: args.error || undefined,
      updatedAt: Date.now(),
    });
  },
});

export const getBackendAssessmentPlanningData = query({
  args: {
    courseId: v.id("courses"),
    assessmentId: v.optional(v.id("assessments")),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) return null;

    let assessment = null;
    if (args.assessmentId) {
      assessment = await ctx.db.get(args.assessmentId);
    }

    const concepts = await ctx.db
      .query("courseConcepts")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const relationships = await ctx.db
      .query("conceptRelationships")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const evidence = await ctx.db
      .query("conceptEvidence")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const visuals = await ctx.db
      .query("sourceVisuals")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const sources = await ctx.db
      .query("sources")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const chunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    return {
      course,
      assessment,
      concepts,
      relationships,
      evidence,
      visuals,
      sources,
      chunks,
    };
  },
});

export const saveGeneratedAssessmentBackend = mutation({
  args: {
    assessmentId: v.id("assessments"),
    status: v.string(), // "ready" | "draft" | "failed"
    error: v.optional(v.union(v.string(), v.null())),
    generationVersion: v.optional(v.union(v.number(), v.null())),
    questions: v.array(
      v.object({
        questionIndex: v.number(),
        questionType: v.string(),
        questionText: v.string(),
        options: v.optional(v.union(v.array(v.string()), v.null())),
        correctAnswer: v.any(),
        acceptedAnswers: v.optional(v.union(v.array(v.string()), v.null())),
        referenceAnswer: v.optional(v.union(v.string(), v.null())),
        requiredKeyPoints: v.optional(v.union(v.array(v.string()), v.null())),
        optionalKeyPoints: v.optional(v.union(v.array(v.string()), v.null())),
        misconceptionIndicators: v.optional(v.union(v.array(v.string()), v.null())),
        rubric: v.optional(v.union(v.array(v.object({
          points: v.number(),
          criterion: v.string(),
        })), v.null())),
        explanation: v.string(),
        difficulty: v.string(),
        conceptIds: v.array(v.id("courseConcepts")),
        conceptNames: v.optional(v.union(v.array(v.string()), v.null())),
        sourceEvidence: v.array(v.object({
          sourceId: v.string(),
          sourceName: v.string(),
          evidenceType: v.string(),
          locationType: v.optional(v.union(v.string(), v.null())),
          sourceChunkId: v.optional(v.union(v.string(), v.null())),
          sourceVisualId: v.optional(v.union(v.string(), v.null())),
          pageNumber: v.optional(v.union(v.number(), v.null())),
          slideNumber: v.optional(v.union(v.number(), v.null())),
          startTime: v.optional(v.union(v.number(), v.null())),
          endTime: v.optional(v.union(v.number(), v.null())),
          visualType: v.optional(v.union(v.string(), v.null())),
          imageUrl: v.optional(v.union(v.string(), v.null())),
          excerpt: v.string(),
        })),
        sourceVisualId: v.optional(v.union(v.id("sourceVisuals"), v.string(), v.null())),
        sourceVisualUrl: v.optional(v.union(v.string(), v.null())),
        points: v.number(),
        qualityScore: v.optional(v.union(v.number(), v.null())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment) throw new Error("Assessment not found");

    // 1. Delete existing draft questions for this assessment
    const existing = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();
    for (const q of existing) {
      await ctx.db.delete(q._id);
    }

    // 2. Insert new questions
    let totalPoints = 0;
    for (const q of args.questions) {
      totalPoints += (typeof q.points === "number" ? q.points : 1);
      await ctx.db.insert("assessmentQuestions", {
        userId: assessment.userId,
        courseId: assessment.courseId,
        assessmentId: args.assessmentId,
        questionIndex: q.questionIndex,
        questionType: q.questionType,
        questionText: q.questionText,
        options: q.options || undefined,
        correctAnswer: q.correctAnswer,
        acceptedAnswers: q.acceptedAnswers || undefined,
        referenceAnswer: q.referenceAnswer || undefined,
        requiredKeyPoints: q.requiredKeyPoints || undefined,
        optionalKeyPoints: q.optionalKeyPoints || undefined,
        misconceptionIndicators: q.misconceptionIndicators || undefined,
        rubric: q.rubric || undefined,
        explanation: q.explanation || "",
        difficulty: q.difficulty || "medium",
        conceptIds: q.conceptIds || [],
        conceptNames: q.conceptNames || undefined,
        sourceEvidence: (q.sourceEvidence || []).map((ev) => ({
          sourceId: ev.sourceId,
          sourceName: ev.sourceName,
          evidenceType: ev.evidenceType,
          locationType: ev.locationType || undefined,
          sourceChunkId: ev.sourceChunkId || undefined,
          sourceVisualId: ev.sourceVisualId || undefined,
          pageNumber: typeof ev.pageNumber === "number" ? ev.pageNumber : undefined,
          slideNumber: typeof ev.slideNumber === "number" ? ev.slideNumber : undefined,
          startTime: typeof ev.startTime === "number" ? ev.startTime : undefined,
          endTime: typeof ev.endTime === "number" ? ev.endTime : undefined,
          visualType: ev.visualType || undefined,
          imageUrl: ev.imageUrl || undefined,
          excerpt: ev.excerpt || "",
        })),
        sourceVisualId: q.sourceVisualId || undefined,
        sourceVisualUrl: q.sourceVisualUrl || undefined,
        points: typeof q.points === "number" ? q.points : 1,
        qualityScore: typeof q.qualityScore === "number" ? q.qualityScore : undefined,
        generationVersion: args.generationVersion || 1,
        createdAt: Date.now(),
      });
    }

    // 3. Patch assessment
    await ctx.db.patch(args.assessmentId, {
      status: args.status,
      error: args.error || undefined,
      generatedQuestionCount: args.questions.length,
      totalPoints,
      estimatedDurationMinutes: Math.ceil(args.questions.length * 1.5),
      generatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true, count: args.questions.length };
  },
});

export const removeQuestion = mutation({
  args: {
    assessmentId: v.id("assessments"),
    questionId: v.id("assessmentQuestions"),
    courseId: v.optional(v.union(v.id("courses"), v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.userId !== user._id) throw new Error("Unauthorized");

    // Can only edit draft or ready assessments before attempts begin
    const attempts = await ctx.db
      .query("assessmentAttempts")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();
    if (attempts.length > 0) throw new Error("Cannot modify questions after attempts have started.");

    const question = await ctx.db.get(args.questionId);
    if (!question || question.assessmentId !== args.assessmentId) return;

    await ctx.db.delete(args.questionId);

    // Re-index remaining questions
    const remaining = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();

    remaining.sort((a, b) => a.questionIndex - b.questionIndex);
    let newPoints = 0;
    for (let i = 0; i < remaining.length; i++) {
      newPoints += remaining[i].points;
      await ctx.db.patch(remaining[i]._id, { questionIndex: i + 1 });
    }

    await ctx.db.patch(args.assessmentId, {
      generatedQuestionCount: remaining.length,
      totalPoints: newPoints,
      updatedAt: Date.now(),
    });
  },
});

export const updateQuestion = mutation({
  args: {
    questionId: v.id("assessmentQuestions"),
    questionText: v.string(),
    options: v.optional(v.union(v.array(v.string()), v.null())),
    correctAnswer: v.any(),
    acceptedAnswers: v.optional(v.union(v.array(v.string()), v.null())),
    referenceAnswer: v.optional(v.union(v.string(), v.null())),
    requiredKeyPoints: v.optional(v.union(v.array(v.string()), v.null())),
    optionalKeyPoints: v.optional(v.union(v.array(v.string()), v.null())),
    misconceptionIndicators: v.optional(v.union(v.array(v.string()), v.null())),
    rubric: v.optional(v.union(v.array(v.object({
      points: v.number(),
      criterion: v.string(),
    })), v.null())),
    explanation: v.string(),
    difficulty: v.string(),
    conceptIds: v.array(v.id("courseConcepts")),
    conceptNames: v.optional(v.union(v.array(v.string()), v.null())),
    sourceEvidence: v.array(v.object({
      sourceId: v.string(),
      sourceName: v.string(),
      evidenceType: v.string(),
      locationType: v.optional(v.union(v.string(), v.null())),
      sourceChunkId: v.optional(v.union(v.string(), v.null())),
      sourceVisualId: v.optional(v.union(v.string(), v.null())),
      pageNumber: v.optional(v.union(v.number(), v.null())),
      slideNumber: v.optional(v.union(v.number(), v.null())),
      startTime: v.optional(v.union(v.number(), v.null())),
      endTime: v.optional(v.union(v.number(), v.null())),
      visualType: v.optional(v.union(v.string(), v.null())),
      imageUrl: v.optional(v.union(v.string(), v.null())),
      excerpt: v.string(),
    })),
    sourceVisualId: v.optional(v.union(v.id("sourceVisuals"), v.string(), v.null())),
    sourceVisualUrl: v.optional(v.union(v.string(), v.null())),
    qualityScore: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const question = await ctx.db.get(args.questionId);
    if (!question || question.userId !== user._id) throw new Error("Unauthorized");

    const { questionId, ...updates } = args;
    const cleanUpdates = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== null && v !== undefined) {
        cleanUpdates[k] = v;
      }
    }
    await ctx.db.patch(questionId, cleanUpdates);
  },
});

export const updateQuestionBackend = mutation({
  args: {
    questionId: v.id("assessmentQuestions"),
    questionText: v.string(),
    options: v.optional(v.union(v.array(v.string()), v.null())),
    correctAnswer: v.any(),
    acceptedAnswers: v.optional(v.union(v.array(v.string()), v.null())),
    referenceAnswer: v.optional(v.union(v.string(), v.null())),
    requiredKeyPoints: v.optional(v.union(v.array(v.string()), v.null())),
    optionalKeyPoints: v.optional(v.union(v.array(v.string()), v.null())),
    misconceptionIndicators: v.optional(v.union(v.array(v.string()), v.null())),
    rubric: v.optional(v.union(v.array(v.object({
      points: v.number(),
      criterion: v.string(),
    })), v.null())),
    explanation: v.string(),
    difficulty: v.string(),
    conceptIds: v.optional(v.array(v.id("courseConcepts"))),
    conceptNames: v.optional(v.union(v.array(v.string()), v.null())),
    sourceEvidence: v.optional(v.array(v.object({
      sourceId: v.string(),
      sourceName: v.string(),
      evidenceType: v.string(),
      locationType: v.optional(v.union(v.string(), v.null())),
      sourceChunkId: v.optional(v.union(v.string(), v.null())),
      sourceVisualId: v.optional(v.union(v.string(), v.null())),
      pageNumber: v.optional(v.union(v.number(), v.null())),
      slideNumber: v.optional(v.union(v.number(), v.null())),
      startTime: v.optional(v.union(v.number(), v.null())),
      endTime: v.optional(v.union(v.number(), v.null())),
      visualType: v.optional(v.union(v.string(), v.null())),
      imageUrl: v.optional(v.union(v.string(), v.null())),
      excerpt: v.string(),
    }))),
    sourceVisualId: v.optional(v.union(v.id("sourceVisuals"), v.string(), v.null())),
    sourceVisualUrl: v.optional(v.union(v.string(), v.null())),
    points: v.optional(v.number()),
    qualityScore: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const { questionId, ...updates } = args;
    const cleanUpdates = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== null && v !== undefined) {
        cleanUpdates[k] = v;
      }
    }
    await ctx.db.patch(questionId, cleanUpdates);
    return { success: true };
  },
});

export const startAttempt = mutation({
  args: {
    assessmentId: v.id("assessments"),
    courseId: v.optional(v.union(v.id("courses"), v.string(), v.null())),
    mode: v.optional(v.union(v.string(), v.null())), // "practice" | "mock_exam"
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.userId !== user._id) throw new Error("Unauthorized");

    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();

    if (questions.length === 0) throw new Error("Assessment has no questions");

    const mode = args.mode || (assessment.assessmentType === "mock_exam" ? "mock_exam" : "practice");

    const attemptId = await ctx.db.insert("assessmentAttempts", {
      userId: user._id,
      courseId: assessment.courseId,
      assessmentId: args.assessmentId,
      status: "in_progress",
      mode,
      startedAt: Date.now(),
      timeLimitMinutes: assessment.timeLimitMinutes,
      maxScore: assessment.totalPoints || questions.reduce((sum, q) => sum + q.points, 0),
      createdAt: Date.now(),
    });

    // Pre-create response records so question states can immediately sync
    for (const q of questions) {
      await ctx.db.insert("assessmentResponses", {
        userId: user._id,
        courseId: assessment.courseId,
        assessmentId: args.assessmentId,
        attemptId,
        questionId: q._id,
        userAnswer: null,
        isAnswered: false,
        maxPoints: q.points,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return attemptId;
  },
});

export const saveResponse = mutation({
  args: {
    attemptId: v.id("assessmentAttempts"),
    questionId: v.id("assessmentQuestions"),
    userAnswer: v.any(),
    courseId: v.optional(v.union(v.id("courses"), v.string(), v.null())),
    assessmentId: v.optional(v.union(v.id("assessments"), v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.userId !== user._id) throw new Error("Unauthorized");
    if (attempt.status !== "in_progress") throw new Error("Attempt is already submitted");

    const existingResponse = await ctx.db
      .query("assessmentResponses")
      .withIndex("by_attempt_question", (q) =>
        q.eq("attemptId", args.attemptId).eq("questionId", args.questionId)
      )
      .unique();

    const isAnswered = args.userAnswer !== null && args.userAnswer !== undefined && args.userAnswer !== "" && (!Array.isArray(args.userAnswer) || args.userAnswer.length > 0);

    if (existingResponse) {
      await ctx.db.patch(existingResponse._id, {
        userAnswer: args.userAnswer,
        isAnswered,
        updatedAt: Date.now(),
      });
      return existingResponse._id;
    } else {
      const question = await ctx.db.get(args.questionId);
      const respId = await ctx.db.insert("assessmentResponses", {
        userId: user._id,
        courseId: attempt.courseId,
        assessmentId: attempt.assessmentId,
        attemptId: args.attemptId,
        questionId: args.questionId,
        userAnswer: args.userAnswer,
        isAnswered,
        maxPoints: question?.points || 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return respId;
    }
  },
});

export const submitAttempt = mutation({
  args: {
    attemptId: v.id("assessmentAttempts"),
    courseId: v.optional(v.union(v.id("courses"), v.string(), v.null())),
    assessmentId: v.optional(v.union(v.id("assessments"), v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.userId !== user._id) throw new Error("Unauthorized");
    if (attempt.status !== "in_progress") return attempt._id;

    const assessment = await ctx.db.get(attempt.assessmentId);
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

    let score = 0;
    let maxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let hasSubjectiveQuestions = false;

    // Track concept performance { correct, total }
    const conceptStats = new Map();

    for (const q of questions) {
      maxScore += q.points;
      const resp = responsesByQuestion.get(q._id);
      const userAnswer = resp?.userAnswer;
      const isAnswered = resp?.isAnswered ?? false;

      // Register concepts in stats
      for (const cid of q.conceptIds) {
        if (!conceptStats.has(cid)) {
          const cName = q.conceptNames?.[q.conceptIds.indexOf(cid)] || "Concept";
          conceptStats.set(cid, { name: cName, correct: 0, total: 0 });
        }
        conceptStats.get(cid).total += 1;
      }

      if (!isAnswered || userAnswer === null || userAnswer === undefined || userAnswer === "") {
        unansweredCount++;
        if (resp) {
          await ctx.db.patch(resp._id, {
            isCorrect: false,
            awardedPoints: 0,
            feedback: "Unanswered question.",
            gradedAt: Date.now(),
          });
        }
        continue;
      }

      // Deterministic Objective Grading
      let isCorrect = false;
      let awardedPoints = 0;
      let feedback = "";

      if (q.questionType === "mcq") {
        isCorrect = String(userAnswer).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase();
        awardedPoints = isCorrect ? q.points : 0;
        feedback = isCorrect ? "Correct answer!" : "Incorrect answer.";
      } else if (q.questionType === "multiple_select") {
        const correctSet = new Set((Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]).map((s) => String(s).trim().toLowerCase()));
        const userSet = new Set((Array.isArray(userAnswer) ? userAnswer : [userAnswer]).map((s) => String(s).trim().toLowerCase()));
        isCorrect = correctSet.size === userSet.size && [...correctSet].every((x) => userSet.has(x));
        awardedPoints = isCorrect ? q.points : 0;
        feedback = isCorrect ? "All correct choices selected!" : "Did not match all correct options.";
      } else if (q.questionType === "true_false") {
        const expectedBool = String(q.correctAnswer).toLowerCase() === "true" || q.correctAnswer === true;
        const userBool = String(userAnswer).toLowerCase() === "true" || userAnswer === true;
        isCorrect = expectedBool === userBool;
        awardedPoints = isCorrect ? q.points : 0;
        feedback = isCorrect ? "Correct!" : "Incorrect.";
      } else if (q.questionType === "numerical") {
        const parsedUser = parseFloat(String(userAnswer).replace(/[^0-9.-]/g, ""));
        const expected = typeof q.correctAnswer === "object" && q.correctAnswer !== null ? q.correctAnswer.expectedValue : parseFloat(q.correctAnswer);
        const tolerance = typeof q.correctAnswer === "object" && q.correctAnswer !== null ? (q.correctAnswer.tolerance ?? 0.01) : 0.01;

        if (!isNaN(parsedUser) && !isNaN(expected)) {
          isCorrect = Math.abs(parsedUser - expected) <= tolerance;
          awardedPoints = isCorrect ? q.points : 0;
          feedback = isCorrect ? `Correct value within tolerance (±${tolerance})!` : `Incorrect value. Expected ~${expected}.`;
        }
      } else {
        // Short Answer / Concept Explanation: Subjective grading needed
        hasSubjectiveQuestions = true;
      }

      if (!["short_answer", "concept_explanation"].includes(q.questionType)) {
        if (isCorrect) {
          correctCount++;
          score += awardedPoints;
          for (const cid of q.conceptIds) {
            conceptStats.get(cid).correct += 1;
          }
        } else {
          incorrectCount++;
        }

        if (resp) {
          await ctx.db.patch(resp._id, {
            isCorrect,
            awardedPoints,
            feedback,
            gradedAt: Date.now(),
          });
        }
      }
    }

    const timeSpentSeconds = Math.max(0, Math.floor((Date.now() - attempt.startedAt) / 1000));
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    const conceptPerformance = Array.from(conceptStats.entries()).map(([cid, stat]) => ({
      conceptId: cid,
      conceptName: stat.name,
      correct: stat.correct,
      total: stat.total,
    }));

    const finalStatus = hasSubjectiveQuestions ? "submitted" : "graded";

    await ctx.db.patch(args.attemptId, {
      status: finalStatus,
      submittedAt: Date.now(),
      score,
      maxScore,
      percentage,
      correctCount,
      incorrectCount,
      unansweredCount,
      timeSpentSeconds,
      conceptPerformance,
    });

    if (finalStatus === "graded") {
      try {
        await processAttemptGradedHelper(ctx, {
          attemptId: args.attemptId,
          reason: "assessment_graded",
        });
      } catch (err) {
        console.error("Failed to update learner model on submitAttempt:", err);
      }
    }

    return {
      attemptId: args.attemptId,
      status: finalStatus,
      hasSubjectiveQuestions,
      score,
      maxScore,
      percentage,
    };
  },
});

export const gradeAttemptBackend = mutation({
  args: {
    attemptId: v.id("assessmentAttempts"),
    subjectiveGrades: v.array(
      v.object({
        questionId: v.id("assessmentQuestions"),
        scoreFraction: v.number(), // 0.0 to 1.0
        awardedPoints: v.number(),
        feedback: v.string(),
        matchedKeyPoints: v.optional(v.array(v.string())),
        missingKeyPoints: v.optional(v.array(v.string())),
        incorrectClaims: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Attempt not found");

    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", attempt.assessmentId))
      .collect();

    const questionsById = new Map();
    for (const q of questions) {
      questionsById.set(q._id, q);
    }

    // Apply subjective grades
    for (const sg of args.subjectiveGrades) {
      const resp = await ctx.db
        .query("assessmentResponses")
        .withIndex("by_attempt_question", (q) =>
          q.eq("attemptId", args.attemptId).eq("questionId", sg.questionId)
        )
        .unique();

      if (resp) {
        const isCorrect = sg.scoreFraction >= 0.7; // 70%+ counts as correct in binary concept tally
        await ctx.db.patch(resp._id, {
          isCorrect,
          awardedPoints: sg.awardedPoints,
          feedback: sg.feedback,
          matchedKeyPoints: sg.matchedKeyPoints,
          missingKeyPoints: sg.missingKeyPoints,
          incorrectClaims: sg.incorrectClaims,
          gradedAt: Date.now(),
        });
      }
    }

    // Recalculate total score and concept performance
    const allResponses = await ctx.db
      .query("assessmentResponses")
      .withIndex("by_attempt", (q) => q.eq("attemptId", args.attemptId))
      .collect();

    let totalScore = 0;
    let totalMaxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    const conceptStats = new Map();

    for (const r of allResponses) {
      const q = questionsById.get(r.questionId);
      if (!q) continue;

      totalMaxScore += r.maxPoints || q.points;
      totalScore += r.awardedPoints || 0;

      for (const cid of q.conceptIds) {
        if (!conceptStats.has(cid)) {
          const cName = q.conceptNames?.[q.conceptIds.indexOf(cid)] || "Concept";
          conceptStats.set(cid, { name: cName, correct: 0, total: 0 });
        }
        conceptStats.get(cid).total += 1;
      }

      if (!r.isAnswered) {
        unansweredCount++;
      } else if (r.isCorrect) {
        correctCount++;
        for (const cid of q.conceptIds) {
          conceptStats.get(cid).correct += 1;
        }
      } else {
        incorrectCount++;
      }
    }

    const percentage = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;

    const conceptPerformance = Array.from(conceptStats.entries()).map(([cid, stat]) => ({
      conceptId: cid,
      conceptName: stat.name,
      correct: stat.correct,
      total: stat.total,
    }));

    await ctx.db.patch(args.attemptId, {
      status: "graded",
      score: totalScore,
      maxScore: totalMaxScore,
      percentage,
      correctCount,
      incorrectCount,
      unansweredCount,
      conceptPerformance,
    });

    try {
      await processAttemptGradedHelper(ctx, {
        attemptId: args.attemptId,
        reason: "assessment_graded",
      });
    } catch (err) {
      console.error("Failed to update learner model on gradeAttemptBackend:", err);
    }

    return { success: true, score: totalScore, percentage };
  },
});

export const deleteAssessment = mutation({
  args: {
    assessmentId: v.id("assessments"),
    courseId: v.optional(v.union(v.id("courses"), v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.userId !== user._id) throw new Error("Unauthorized");

    // Cascade delete responses, attempts, questions
    const responses = await ctx.db
      .query("assessmentResponses")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();
    for (const r of responses) {
      await ctx.db.delete(r._id);
    }

    const attempts = await ctx.db
      .query("assessmentAttempts")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();
    for (const a of attempts) {
      await ctx.db.delete(a._id);
    }

    const questions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_assessment", (q) => q.eq("assessmentId", args.assessmentId))
      .collect();
    for (const q of questions) {
      await ctx.db.delete(q._id);
    }

    await ctx.db.delete(args.assessmentId);
  },
});
