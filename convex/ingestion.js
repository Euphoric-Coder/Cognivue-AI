import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const updateStatus = mutation({
  args: {
    sourceId: v.id("sources"),
    status: v.string(),
    processingStage: v.optional(v.string()),
    processingProgress: v.optional(v.number()),
    processingError: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    slideCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // This is called by HTTP action, no user auth
    const source = await ctx.db.get(args.sourceId);
    if (!source) return;

    await ctx.db.patch(args.sourceId, {
      status: args.status,
      processingStage: args.processingStage,
      processingProgress: args.processingProgress,
      processingError: args.processingError,
      pageCount: args.pageCount ?? source.pageCount,
      slideCount: args.slideCount ?? source.slideCount,
      updatedAt: Date.now(),
      processedAt: args.status === "ready" ? Date.now() : source.processedAt,
    });
  },
});

export const saveChunks = mutation({
  args: {
    sourceId: v.id("sources"),
    chunks: v.array(
      v.object({
        text: v.string(),
        locationType: v.string(),
        pageNumber: v.optional(v.number()),
        slideNumber: v.optional(v.number()),
        sectionTitle: v.optional(v.string()),
        chunkIndex: v.number(),
        tokenEstimate: v.optional(v.number()),
        characterCount: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return;

    // Delete existing chunks for idempotency
    const existingChunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
      
    for (const chunk of existingChunks) {
      await ctx.db.delete(chunk._id);
    }

    // Insert new chunks
    for (const chunk of args.chunks) {
      await ctx.db.insert("sourceChunks", {
        ...chunk,
        userId: source.userId,
        courseId: source.courseId,
        sourceId: args.sourceId,
        createdAt: Date.now(),
      });
    }

    // Update chunk count on source
    await ctx.db.patch(args.sourceId, {
      chunkCount: args.chunks.length,
      updatedAt: Date.now(),
    });
  },
});
