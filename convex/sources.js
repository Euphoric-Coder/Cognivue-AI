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
    
    return sourceId;
  },
});

export const deleteSource = mutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const source = await ctx.db.get(args.sourceId);
    
    if (!source || source.userId !== user._id) throw new Error("Unauthorized");
    
    if (source.storageId) {
      await ctx.storage.delete(source.storageId);
    }
    
    await ctx.db.delete(args.sourceId);
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
