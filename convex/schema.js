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
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_course", ["courseId"]),

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
    description: v.optional(v.string()),

    assessmentType: v.string(), // "practice" | "topic_quiz" | "mixed_quiz" | "mock_exam"

    status: v.string(), // "generating" | "draft" | "ready" | "failed" | "archived"
    error: v.optional(v.string()),

    selectedConceptIds: v.array(v.id("courseConcepts")),
    selectedConceptNames: v.optional(v.array(v.string())),

    difficulty: v.string(), // "easy" | "medium" | "hard" | "mixed"

    questionCount: v.number(),

    questionTypeConfig: v.object({
      mcq: v.boolean(),
      multiple_select: v.boolean(),
      true_false: v.boolean(),
      short_answer: v.boolean(),
      numerical: v.boolean(),
      concept_explanation: v.boolean(),
    }),

    timeLimitMinutes: v.optional(v.number()),

    shuffleQuestions: v.optional(v.boolean()),
    shuffleOptions: v.optional(v.boolean()),

    generationVersion: v.optional(v.number()),
    courseSnapshotHash: v.optional(v.string()),
    graphVersion: v.optional(v.number()),

    generatedQuestionCount: v.optional(v.number()),
    totalPoints: v.optional(v.number()),
    estimatedDurationMinutes: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
    generatedAt: v.optional(v.number()),
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

    options: v.optional(v.array(v.string())),

    correctAnswer: v.any(),
    acceptedAnswers: v.optional(v.array(v.string())),

    referenceAnswer: v.optional(v.string()),
    requiredKeyPoints: v.optional(v.array(v.string())),
    optionalKeyPoints: v.optional(v.array(v.string())),
    misconceptionIndicators: v.optional(v.array(v.string())),
    rubric: v.optional(v.array(v.object({
      points: v.number(),
      criterion: v.string(),
    }))),

    explanation: v.string(),

    difficulty: v.string(), // "easy" | "medium" | "hard"

    conceptIds: v.array(v.id("courseConcepts")),
    conceptNames: v.optional(v.array(v.string())),

    sourceEvidence: v.array(v.object({
      sourceId: v.string(),
      sourceName: v.string(),
      evidenceType: v.string(),
      locationType: v.optional(v.string()),
      sourceChunkId: v.optional(v.string()),
      sourceVisualId: v.optional(v.string()),
      pageNumber: v.optional(v.number()),
      slideNumber: v.optional(v.number()),
      startTime: v.optional(v.number()),
      endTime: v.optional(v.number()),
      visualType: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      excerpt: v.string(),
    })),

    sourceVisualId: v.optional(v.id("sourceVisuals")),
    sourceVisualUrl: v.optional(v.string()),

    points: v.number(),

    qualityScore: v.optional(v.number()),
    generationVersion: v.optional(v.number()),

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
    mode: v.optional(v.string()), // "practice" | "mock_exam"

    startedAt: v.number(),
    submittedAt: v.optional(v.number()),

    timeLimitMinutes: v.optional(v.number()),

    score: v.optional(v.number()),
    maxScore: v.optional(v.number()),
    percentage: v.optional(v.number()),

    correctCount: v.optional(v.number()),
    incorrectCount: v.optional(v.number()),
    unansweredCount: v.optional(v.number()),

    timeSpentSeconds: v.optional(v.number()),

    conceptPerformance: v.optional(v.array(v.object({
      conceptId: v.string(),
      conceptName: v.string(),
      correct: v.number(),
      total: v.number(),
    }))),

    createdAt: v.number(),
  })
    .index("by_assessment", ["assessmentId"])
    .index("by_user", ["userId"])
    .index("by_course", ["courseId"])
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
    isCorrect: v.optional(v.boolean()),

    awardedPoints: v.optional(v.number()),
    maxPoints: v.number(),

    feedback: v.optional(v.string()),

    matchedKeyPoints: v.optional(v.array(v.string())),
    missingKeyPoints: v.optional(v.array(v.string())),
    incorrectClaims: v.optional(v.array(v.string())),

    gradedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attempt", ["attemptId"])
    .index("by_question", ["questionId"])
    .index("by_attempt_question", ["attemptId", "questionId"])
    .index("by_user", ["userId"]),
});
