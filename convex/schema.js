import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  courses: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    subject: v.optional(v.string()),
    courseCode: v.optional(v.string()),
    academicLevel: v.optional(v.string()),
    status: v.string(), // "active" | "archived"

    // V6 Knowledge Graph Metadata & Status
    knowledgeGraphStatus: v.optional(v.string()), // "not_started" | "building" | "ready" | "failed" | "outdated"
    knowledgeGraphError: v.optional(v.string()),
    conceptCount: v.optional(v.number()),
    relationshipCount: v.optional(v.number()),
    coreConceptCount: v.optional(v.number()),
    prerequisiteCount: v.optional(v.number()),
    graphVersion: v.optional(v.number()),
    graphGeneratedAt: v.optional(v.number()),
    sourceSnapshotHash: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  sources: defineTable({
    courseId: v.id("courses"),
    userId: v.id("users"),
    name: v.string(),
    originalFileName: v.string(),
    type: v.string(),
    mimeType: v.string(),
    size: v.number(),
    status: v.string(), // "uploaded", "queued", "extracting", "normalizing", "chunking", "ready", "failed"
    
    // New Processing Fields
    processingStage: v.optional(v.string()),
    processingProgress: v.optional(v.number()),
    processingError: v.optional(v.string()),
    
    // RAG Status
    ragStatus: v.optional(v.string()), // "not_available", "pending", "embedding", "ready", "failed"
    
    pageCount: v.optional(v.number()),
    slideCount: v.optional(v.number()),
    chunkCount: v.optional(v.number()),
    
    // Video Metadata
    durationSeconds: v.optional(v.number()),
    transcriptSegmentCount: v.optional(v.number()),
    language: v.optional(v.string()),
    transcriptionProvider: v.optional(v.string()),
    
    // V5 Visual Metadata & Status
    visualStatus: v.optional(v.string()), // "not_started", "processing", "ready", "failed"
    visualCount: v.optional(v.number()),
    diagramCount: v.optional(v.number()),
    chartCount: v.optional(v.number()),
    tableCount: v.optional(v.number()),
    keyframeCount: v.optional(v.number()),
    visualError: v.optional(v.string()),

    processedAt: v.optional(v.number()),
    retryCount: v.optional(v.number()),
    
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_user", ["userId"]),

  sourceVisuals: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    sourceId: v.id("sources"),

    visualId: v.string(),

    locationType: v.string(), // "page", "slide", or "video"
    pageNumber: v.optional(v.number()),
    slideNumber: v.optional(v.number()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),

    visualType: v.string(), // "diagram", "chart", "graph", "table", "screenshot", "illustration", "equation", "photo", "flowchart", "architecture", "er_diagram", "state_diagram", "unknown"

    storageId: v.optional(v.string()),
    imageUrl: v.optional(v.string()),

    width: v.optional(v.number()),
    height: v.optional(v.number()),

    extractedText: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.string(),

    structuredData: v.optional(v.any()),
    confidenceNotes: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),

    processingStatus: v.optional(v.string()), // "ready", "failed"
    createdAt: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_course", ["courseId"])
    .index("by_course_source", ["courseId", "sourceId"]),

  sourceChunks: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    sourceId: v.id("sources"),

    text: v.string(),

    locationType: v.string(), // "page", "slide", "video", or "visual"
    pageNumber: v.optional(v.number()),
    slideNumber: v.optional(v.number()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),

    // V5 Visual linkage
    sourceVisualId: v.optional(v.id("sourceVisuals")),
    evidenceType: v.optional(v.string()), // "text" | "visual"
    visualType: v.optional(v.string()),

    sectionTitle: v.optional(v.string()),
    headingPath: v.optional(v.array(v.string())),

    chunkIndex: v.number(),

    tokenEstimate: v.optional(v.number()),
    characterCount: v.number(),

    embedding: v.optional(v.array(v.float64())),

    createdAt: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_course", ["courseId"])
    .index("by_course_source", ["courseId", "sourceId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 3072, // Gemini gemini-embedding-2
      filterFields: ["courseId", "sourceId"],
    }),

  transcriptSegments: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    sourceId: v.id("sources"),

    text: v.string(),

    startTime: v.number(),
    endTime: v.number(),

    segmentIndex: v.number(),
    speakerLabel: v.optional(v.string()),
    confidence: v.optional(v.number()),

    createdAt: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_course", ["courseId"]),

  tutorSessions: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    title: v.optional(v.string()),
    tutorMode: v.optional(v.string()), // "adaptive", "explain", "socratic", "hint", "quick_review", "deep_dive"
    activeHintLevel: v.optional(v.number()),
    activeConceptId: v.optional(v.union(v.id("courseConcepts"), v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_user", ["userId"])
    .index("by_user_course", ["userId", "courseId"]),

  tutorMessages: defineTable({
    sessionId: v.id("tutorSessions"),
    userId: v.id("users"),
    courseId: v.id("courses"),
    role: v.string(), // "user" or "assistant"
    content: v.string(),
    grounded: v.optional(v.boolean()),
    retrievalStatus: v.optional(v.string()),
    citations: v.optional(v.array(v.object({
      sourceId: v.string(),
      sourceChunkId: v.string(),
      sourceVisualId: v.optional(v.string()),
      sourceName: v.string(),
      locationType: v.string(),
      pageNumber: v.optional(v.number()),
      slideNumber: v.optional(v.number()),
      startTime: v.optional(v.number()),
      endTime: v.optional(v.number()),
      evidenceType: v.optional(v.string()),
      visualType: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      confidenceNotes: v.optional(v.array(v.string())),
      sectionTitle: v.optional(v.string()),
      excerpt: v.optional(v.string())
    }))),
    adaptation: v.optional(v.union(v.object({
      conceptId: v.optional(v.union(v.string(), v.null())),
      conceptName: v.optional(v.union(v.string(), v.null())),
      masteryBand: v.optional(v.union(v.string(), v.null())),
      masteryPercentage: v.optional(v.union(v.number(), v.null())),
      confidence: v.optional(v.union(v.string(), v.null())),
      tutorMode: v.optional(v.union(v.string(), v.null())),
      pedagogyStrategy: v.optional(v.union(v.string(), v.null())),
      prerequisiteIntervention: v.optional(v.union(v.boolean(), v.null())),
      weakPrerequisiteName: v.optional(v.union(v.string(), v.null())),
      misconceptionAddressed: v.optional(v.union(v.string(), v.null())),
      hintLevel: v.optional(v.union(v.number(), v.null())),
      whyThisApproach: v.optional(v.union(v.string(), v.null())),
      followUpSuggestions: v.optional(v.union(v.array(v.string()), v.null())),
    }), v.null())),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_course", ["courseId"]),

  // V9 Adaptive Tutor Misconceptions and Adaptation Events
  learnerMisconceptions: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    conceptId: v.optional(v.union(v.id("courseConcepts"), v.string(), v.null())),
    conceptName: v.optional(v.union(v.string(), v.null())),

    misconceptionKey: v.string(),
    description: v.string(),

    evidenceCount: v.number(),
    confidence: v.string(), // "low" | "medium" | "high"
    confidenceScore: v.number(), // 0.0 to 1.0

    firstObservedAt: v.number(),
    lastObservedAt: v.number(),

    active: v.boolean(),
    sourceResponseIds: v.array(v.string()),

    updatedAt: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_course_active", ["userId", "courseId", "active"])
    .index("by_user_concept", ["userId", "conceptId"])
    .index("by_user_course_key", ["userId", "courseId", "misconceptionKey"]),

  tutorAdaptationEvents: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    sessionId: v.id("tutorSessions"),
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

    createdAt: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_session", ["sessionId"])
    .index("by_user_course_time", ["userId", "courseId", "createdAt"]),

  // V6 Course Knowledge Graph Tables
  courseConcepts: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),

    name: v.string(),
    normalizedName: v.string(),
    description: v.string(),

    type: v.string(), // "topic", "concept", "formula", "method", "definition", "process", "system", "entity", "principle", "skill", "other"
    importance: v.string(), // "core", "supporting", "minor"

    sourceCount: v.number(),
    evidenceCount: v.number(),

    aliases: v.optional(v.array(v.string())),
    masteryEligible: v.optional(v.boolean()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_user", ["userId"])
    .index("by_course_normalized", ["courseId", "normalizedName"])
    .index("by_course_importance", ["courseId", "importance"]),

  conceptRelationships: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),

    fromConceptId: v.id("courseConcepts"),
    toConceptId: v.id("courseConcepts"),

    relationType: v.string(), // "PREREQUISITE_OF", "DEPENDS_ON", "PART_OF", "RELATED_TO", "APPLIES_TO", "USED_FOR", "EXAMPLE_OF", "CONTRASTS_WITH", "CAUSES", "FOLLOWS"

    confidence: v.string(), // "high", "medium", "low"
    confidenceScore: v.optional(v.number()),

    explanation: v.optional(v.string()),
    evidenceSummary: v.optional(v.string()),
    evidenceIds: v.optional(v.array(v.string())),

    createdAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_user", ["userId"])
    .index("by_from_concept", ["fromConceptId"])
    .index("by_to_concept", ["toConceptId"])
    .index("by_course_from", ["courseId", "fromConceptId"])
    .index("by_course_to", ["courseId", "toConceptId"])
    .index("by_pair", ["fromConceptId", "toConceptId"]),

  conceptEvidence: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    conceptId: v.id("courseConcepts"),

    sourceId: v.id("sources"),
    sourceName: v.string(),

    evidenceType: v.string(), // "text", "visual", "video_transcript", "video_visual"

    sourceChunkId: v.optional(v.id("sourceChunks")),
    sourceVisualId: v.optional(v.id("sourceVisuals")),

    pageNumber: v.optional(v.number()),
    slideNumber: v.optional(v.number()),

    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),

    visualType: v.optional(v.string()),
    imageUrl: v.optional(v.string()),

    excerpt: v.string(),

    confidence: v.optional(v.string()),
    confidenceScore: v.optional(v.number()),

    createdAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_concept", ["conceptId"])
    .index("by_source", ["sourceId"])
    .index("by_course_concept", ["courseId", "conceptId"]),

  // V7 Grounded Assessment Engine Tables
  assessments: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),

    title: v.string(),
    description: v.optional(v.union(v.string(), v.null())),

    assessmentType: v.string(), // "practice" | "topic_quiz" | "mixed_quiz" | "mock_exam"

    status: v.string(), // "generating" | "draft" | "ready" | "failed" | "archived"
    error: v.optional(v.union(v.string(), v.null())),

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

    generationVersion: v.optional(v.union(v.number(), v.null())),
    courseSnapshotHash: v.optional(v.union(v.string(), v.null())),
    graphVersion: v.optional(v.union(v.number(), v.null())),

    generatedQuestionCount: v.optional(v.union(v.number(), v.null())),
    totalPoints: v.optional(v.union(v.number(), v.null())),
    estimatedDurationMinutes: v.optional(v.union(v.number(), v.null())),

    createdAt: v.number(),
    updatedAt: v.number(),
    generatedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_course", ["courseId"])
    .index("by_user", ["userId"])
    .index("by_user_course", ["userId", "courseId"])
    .index("by_course_status", ["courseId", "status"]),

  assessmentQuestions: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    assessmentId: v.id("assessments"),

    questionIndex: v.number(),

    questionType: v.string(), // "mcq" | "multiple_select" | "true_false" | "short_answer" | "numerical" | "concept_explanation"

    questionText: v.string(),

    options: v.optional(v.union(v.array(v.string()), v.array(v.object({ text: v.string(), misconceptionKey: v.optional(v.string()) })), v.null())),
    distractorMisconceptions: v.optional(v.union(v.array(v.object({
      optionIndex: v.number(),
      misconceptionKey: v.string(),
      description: v.optional(v.string()),
    })), v.null())),

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

    difficulty: v.string(), // "easy" | "medium" | "hard"

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
    generationVersion: v.optional(v.union(v.number(), v.null())),

    createdAt: v.number(),
  })
    .index("by_assessment", ["assessmentId"])
    .index("by_course", ["courseId"])
    .index("by_assessment_index", ["assessmentId", "questionIndex"]),

  assessmentAttempts: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    assessmentId: v.id("assessments"),

    status: v.string(), // "in_progress" | "submitted" | "graded"
    mode: v.optional(v.union(v.string(), v.null())), // "practice" | "mock_exam"

    startedAt: v.number(),
    submittedAt: v.optional(v.union(v.number(), v.null())),

    timeLimitMinutes: v.optional(v.union(v.number(), v.null())),

    score: v.optional(v.union(v.number(), v.null())),
    maxScore: v.optional(v.union(v.number(), v.null())),
    percentage: v.optional(v.union(v.number(), v.null())),

    correctCount: v.optional(v.union(v.number(), v.null())),
    incorrectCount: v.optional(v.union(v.number(), v.null())),
    unansweredCount: v.optional(v.union(v.number(), v.null())),

    timeSpentSeconds: v.optional(v.union(v.number(), v.null())),

    conceptPerformance: v.optional(v.union(v.array(v.object({
      conceptId: v.string(),
      conceptName: v.string(),
      correct: v.number(),
      total: v.number(),
    })), v.null())),

    createdAt: v.number(),
  })
    .index("by_assessment", ["assessmentId"])
    .index("by_user", ["userId"])
    .index("by_course", ["courseId"])
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_assessment", ["userId", "assessmentId"])
    .index("by_assessment_status", ["assessmentId", "status"]),

  assessmentResponses: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    assessmentId: v.id("assessments"),
    attemptId: v.id("assessmentAttempts"),
    questionId: v.id("assessmentQuestions"),

    userAnswer: v.any(),

    isAnswered: v.boolean(),
    isCorrect: v.optional(v.union(v.boolean(), v.null())),

    awardedPoints: v.optional(v.union(v.number(), v.null())),
    maxPoints: v.number(),

    feedback: v.optional(v.union(v.string(), v.null())),

    matchedKeyPoints: v.optional(v.union(v.array(v.string()), v.null())),
    missingKeyPoints: v.optional(v.union(v.array(v.string()), v.null())),
    incorrectClaims: v.optional(v.union(v.array(v.string()), v.null())),

    gradedAt: v.optional(v.union(v.number(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attempt", ["attemptId"])
    .index("by_question", ["questionId"])
    .index("by_attempt_question", ["attemptId", "questionId"])
    .index("by_assessment", ["assessmentId"])
    .index("by_course", ["courseId"])
    .index("by_user", ["userId"]),

  // V8 Learner Model & Knowledge Tracing Tables
  learnerObservations: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    conceptId: v.id("courseConcepts"),
    conceptKey: v.string(), // Durable semantic identity: courseId + normalizedName
    conceptName: v.string(),

    assessmentId: v.id("assessments"),
    attemptId: v.id("assessmentAttempts"),
    questionId: v.id("assessmentQuestions"),
    responseId: v.id("assessmentResponses"),

    questionType: v.string(), // "mcq" | "multiple_select" | "true_false" | "short_answer" | "numerical" | "concept_explanation"
    difficulty: v.string(), // "easy" | "medium" | "hard"

    scoreFraction: v.number(), // 0.0 to 1.0 (preserves partial credit)
    correctness: v.string(), // "correct" | "partial" | "incorrect" | "unanswered"

    weight: v.number(), // Difficulty * Type * Multi-concept contribution
    timestamp: v.number(),

    modelVersion: v.string(), // e.g. "mastery-v1"
    createdAt: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_concept", ["userId", "conceptId"])
    .index("by_user_concept_key", ["userId", "courseId", "conceptKey"])
    .index("by_attempt", ["attemptId"])
    .index("by_response_concept", ["responseId", "conceptId"]),

  learnerConceptStates: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    conceptId: v.id("courseConcepts"),
    conceptKey: v.string(),
    conceptName: v.string(),
    importance: v.string(), // "core" | "supporting" | "minor"
    conceptType: v.optional(v.union(v.string(), v.null())),

    masteryProbability: v.number(), // 0.00 to 1.00
    masteryBand: v.string(), // "insufficient_evidence" | "needs_attention" | "developing" | "proficient" | "strong"

    confidence: v.string(), // "insufficient" | "low" | "medium" | "high"
    confidenceScore: v.number(), // 0.00 to 1.00

    evidenceCount: v.number(),

    totalAttempts: v.number(),
    correctAttempts: v.number(),
    partialAttempts: v.number(),
    incorrectAttempts: v.number(),
    unansweredAttempts: v.optional(v.union(v.number(), v.null())),

    weightedScore: v.number(),
    recentScore: v.number(),

    difficultyExposure: v.object({
      easy: v.number(),
      medium: v.number(),
      hard: v.number(),
    }),

    lastObservedAt: v.optional(v.union(v.number(), v.null())),
    firstObservedAt: v.optional(v.union(v.number(), v.null())),

    trend: v.string(), // "improving" | "stable" | "declining" | "insufficient_data"
    trendDelta: v.optional(v.union(v.number(), v.null())),

    readiness: v.optional(v.union(v.string(), v.null())), // "ready" | "needs_attention" | "developing" | "not_applicable"
    prerequisiteCount: v.optional(v.union(v.number(), v.null())),
    prerequisitesSummary: v.optional(
      v.union(
        v.array(
          v.object({
            conceptId: v.string(),
            conceptName: v.string(),
            mastery: v.number(),
            masteryBand: v.string(),
          })
        ),
        v.null()
      )
    ),

    isArchived: v.optional(v.union(v.boolean(), v.null())),
    modelVersion: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_concept", ["userId", "conceptId"])
    .index("by_user_concept_key", ["userId", "courseId", "conceptKey"])
    .index("by_course", ["courseId"])
    .index("by_user_course_band", ["userId", "courseId", "masteryBand"]),

  learnerMasterySnapshots: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),

    attemptId: v.optional(v.union(v.id("assessmentAttempts"), v.null())),
    assessmentTitle: v.optional(v.union(v.string(), v.null())),

    overallMastery: v.number(),
    coverage: v.number(),
    observedConceptCount: v.number(),
    totalConceptCount: v.number(),

    reason: v.string(), // "assessment_graded" | "backfill" | "recompute"

    conceptDeltas: v.optional(
      v.union(
        v.array(
          v.object({
            conceptId: v.string(),
            conceptName: v.string(),
            before: v.number(),
            after: v.number(),
            delta: v.number(),
            masteryBand: v.optional(v.union(v.string(), v.null())),
            confidence: v.optional(v.union(v.string(), v.null())),
            evidenceCount: v.optional(v.union(v.number(), v.null())),
          })
        ),
        v.null()
      )
    ),

    timestamp: v.number(),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_course_time", ["userId", "courseId", "timestamp"])
    .index("by_attempt", ["attemptId"]),
});
