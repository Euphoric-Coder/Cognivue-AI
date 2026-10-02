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
    status: v.string(), // "uploaded", "processing", "ready", "failed"
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_user", ["userId"]),
});
