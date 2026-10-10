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

  sourceChunks: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    sourceId: v.id("sources"),

    text: v.string(),

    locationType: v.string(), // "page" or "slide"
    pageNumber: v.optional(v.number()),
    slideNumber: v.optional(v.number()),

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
      sourceName: v.string(),
      locationType: v.string(),
      pageNumber: v.optional(v.number()),
      slideNumber: v.optional(v.number()),
      sectionTitle: v.optional(v.string()),
      excerpt: v.optional(v.string())
    }))),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_course", ["courseId"]),
});
