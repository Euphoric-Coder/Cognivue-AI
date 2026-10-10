import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function requireUser(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
    
  if (!user) throw new Error("User not found");
  return user;
}

export const generateUploadUrl = mutation(async (ctx) => {
  await requireUser(ctx);
  return await ctx.storage.generateUploadUrl();
});

export const getCourseSources = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    
    // Check course ownership
    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) {
      throw new Error("Unauthorized");
    }
    
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
      
    // Sort by creation date descending
    return sources.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createSource = mutation({
  args: {
    courseId: v.id("courses"),
    name: v.string(),
    originalFileName: v.string(),
    type: v.string(),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    
    // Verify course ownership
    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) {
      throw new Error("Unauthorized");
    }
    
    let fileUrl = undefined;
    if (args.storageId) {
      fileUrl = await ctx.storage.getUrl(args.storageId);
    }
    
    const sourceId = await ctx.db.insert("sources", {
      courseId: args.courseId,
      userId: user._id,
      name: args.name,
      originalFileName: args.originalFileName,
      type: args.type,
      mimeType: args.mimeType,
      size: args.size,
      status: "uploaded", // Initial status
      storageId: args.storageId,
      fileUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return { sourceId, fileUrl };
  },
});

export const deleteSource = mutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    console.log(`SOURCE_DELETE_START: sourceId=${args.sourceId}`);
    const user = await requireUser(ctx);
    const source = await ctx.db.get(args.sourceId);
    
    if (!source || source.userId !== user._id) throw new Error("Unauthorized");
    
    // 1. Cascade delete sourceChunks
    const chunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
      
    let chunksDeleted = 0;
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
      chunksDeleted++;
    }
    console.log(`SOURCE_CHUNKS_DELETE_COMPLETE: sourceId=${args.sourceId}, count=${chunksDeleted}`);
    console.log(`SOURCE_VECTORS_DELETE_COMPLETE: implicitly handled via sourceChunks`);
    
    // 2. Delete storage
    if (source.storageId) {
      await ctx.storage.delete(source.storageId);
      console.log(`SOURCE_STORAGE_DELETE_COMPLETE`);
    }
    
    // 3. Delete source record
    await ctx.db.delete(args.sourceId);
    console.log(`SOURCE_DELETE_COMPLETE: sourceId=${args.sourceId}, chunksDeleted=${chunksDeleted}, storageDeleted=${!!source.storageId}`);
  },
});

export const updateSource = mutation({
  args: {
    sourceId: v.id("sources"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const source = await ctx.db.get(args.sourceId);
    
    if (!source || source.userId !== user._id) throw new Error("Unauthorized");
    
    await ctx.db.patch(args.sourceId, {
      name: args.name,
      updatedAt: Date.now(),
    });
  },
});

export const getSource = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const source = await ctx.db.get(args.sourceId);
    
    if (!source || source.userId !== user._id) return null;
    
    return source;
  },
});

export const getSourceChunks = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const source = await ctx.db.get(args.sourceId);
    
    if (!source || source.userId !== user._id) return [];
    
    const chunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
      
    // Sort chunks logically
    return chunks.sort((a, b) => {
      const numA = a.pageNumber || a.slideNumber || 0;
      const numB = b.pageNumber || b.slideNumber || 0;
      if (numA !== numB) return numA - numB;
      return a.chunkIndex - b.chunkIndex;
    });
  },
});

import { internalQuery, internalMutation } from "./_generated/server";
export const getAllSourcesDebug = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sources").collect();
  },
});

export const createSourceDebug = internalMutation({
  args: {
    courseId: v.id("courses")
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    return await ctx.db.insert("sources", {
      courseId: args.courseId,
      userId: course.userId,
      name: "Auto-Test Source",
      originalFileName: "test_pipeline.pdf",
      type: "pdf",
      mimeType: "application/pdf",
      size: 1024,
      status: "uploaded",
      fileUrl: "https://raw.githubusercontent.com/w3c/web-platform-tests/master/pdf/test-pdf-1.pdf",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
