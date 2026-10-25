import { mutation, internalMutation, query } from "./_generated/server";
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
    durationSeconds: v.optional(v.number()),
    transcriptSegmentCount: v.optional(v.number()),
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
      durationSeconds: args.durationSeconds ?? source.durationSeconds,
      transcriptSegmentCount: args.transcriptSegmentCount ?? source.transcriptSegmentCount,
      updatedAt: Date.now(),
      processedAt: args.status === "ready" ? Date.now() : source.processedAt,
    });
  },
});

export const updateRagStatus = mutation({
  args: {
    sourceId: v.id("sources"),
    ragStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, {
      ragStatus: args.ragStatus,
      updatedAt: Date.now(),
    });

    if (args.ragStatus === "ready") {
      const source = await ctx.db.get(args.sourceId);
      if (source) {
        const course = await ctx.db.get(source.courseId);
        if (course && course.knowledgeGraphStatus === "ready") {
          await ctx.db.patch(source.courseId, {
            knowledgeGraphStatus: "outdated",
            updatedAt: Date.now(),
          });
          console.log(`KG_MARKED_OUTDATED: sourceRagReady=${args.sourceId}, courseId=${source.courseId}`);
        }
      }
    }
  },
});

export const getChunksForEmbedding = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
    return chunks;
  }
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
        startTime: v.optional(v.number()),
        endTime: v.optional(v.number()),
        sectionTitle: v.optional(v.string()),
        chunkIndex: v.number(),
        tokenEstimate: v.optional(v.number()),
        characterCount: v.number(),
        sourceVisualId: v.optional(v.id("sourceVisuals")),
        evidenceType: v.optional(v.string()),
        visualType: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return;

    // Delete existing non-visual (text) chunks for idempotency
    const existingChunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
      
    for (const chunk of existingChunks) {
      if (!chunk.evidenceType || chunk.evidenceType !== "visual") {
        await ctx.db.delete(chunk._id);
      }
    }

    // Insert new text chunks
    for (const chunk of args.chunks) {
      await ctx.db.insert("sourceChunks", {
        ...chunk,
        evidenceType: chunk.evidenceType || "text",
        userId: source.userId,
        courseId: source.courseId,
        sourceId: args.sourceId,
        createdAt: Date.now(),
      });
    }

    // Recalculate total chunk count
    const totalChunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    await ctx.db.patch(args.sourceId, {
      chunkCount: totalChunks.length,
      updatedAt: Date.now(),
    });
  },
});

export const saveVisualChunks = mutation({
  args: {
    sourceId: v.id("sources"),
    chunks: v.array(
      v.object({
        text: v.string(),
        locationType: v.string(),
        pageNumber: v.optional(v.number()),
        slideNumber: v.optional(v.number()),
        startTime: v.optional(v.number()),
        endTime: v.optional(v.number()),
        sectionTitle: v.optional(v.string()),
        chunkIndex: v.number(),
        tokenEstimate: v.optional(v.number()),
        characterCount: v.number(),
        sourceVisualId: v.optional(v.id("sourceVisuals")),
        evidenceType: v.optional(v.string()),
        visualType: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return;

    // Delete existing visual chunks for idempotency
    const existingChunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
      
    for (const chunk of existingChunks) {
      if (chunk.evidenceType === "visual") {
        await ctx.db.delete(chunk._id);
      }
    }

    // Insert new visual chunks
    for (const chunk of args.chunks) {
      await ctx.db.insert("sourceChunks", {
        ...chunk,
        evidenceType: "visual",
        userId: source.userId,
        courseId: source.courseId,
        sourceId: args.sourceId,
        createdAt: Date.now(),
      });
    }

    // Recalculate total chunk count
    const totalChunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    await ctx.db.patch(args.sourceId, {
      chunkCount: totalChunks.length,
      updatedAt: Date.now(),
    });
  },
});

export const saveTranscriptSegments = mutation({
  args: {
    sourceId: v.id("sources"),
    segments: v.array(
      v.object({
        text: v.string(),
        startTime: v.number(),
        endTime: v.number(),
        segmentIndex: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return;

    // Idempotency
    const existingSegments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
      
    for (const segment of existingSegments) {
      await ctx.db.delete(segment._id);
    }

    let insertedCount = 0;
    for (const segment of args.segments) {
      await ctx.db.insert("transcriptSegments", {
        ...segment,
        userId: source.userId,
        courseId: source.courseId,
        sourceId: args.sourceId,
        createdAt: Date.now(),
      });
      insertedCount++;
    }
    return { insertedCount };
  },
});

export const getTranscriptSegmentsBackend = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
    return segments.sort((a, b) => a.segmentIndex - b.segmentIndex);
  }
});

export const deleteChunks = mutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }
    await ctx.db.patch(args.sourceId, {
      chunkCount: 0,
      ragStatus: "pending"
    });
  }
});

export const updateVisualStatus = mutation({
  args: {
    sourceId: v.id("sources"),
    visualStatus: v.string(),
    visualError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sourceId, {
      visualStatus: args.visualStatus,
      visualError: args.visualError,
      updatedAt: Date.now(),
    });

    if (args.visualStatus === "ready") {
      const source = await ctx.db.get(args.sourceId);
      if (source) {
        const course = await ctx.db.get(source.courseId);
        if (course && course.knowledgeGraphStatus === "ready") {
          await ctx.db.patch(source.courseId, {
            knowledgeGraphStatus: "outdated",
            updatedAt: Date.now(),
          });
          console.log(`KG_MARKED_OUTDATED: sourceVisualReady=${args.sourceId}, courseId=${source.courseId}`);
        }
      }
    }
  },
});

export const saveVisuals = mutation({
  args: {
    sourceId: v.id("sources"),
    visuals: v.array(
      v.object({
        visualId: v.string(),
        locationType: v.string(),
        pageNumber: v.optional(v.number()),
        slideNumber: v.optional(v.number()),
        startTime: v.optional(v.number()),
        endTime: v.optional(v.number()),
        visualType: v.string(),
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
        processingStatus: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return { visualIdMap: {} };

    // Idempotency: delete existing visuals for this source
    const existingVisuals = await ctx.db
      .query("sourceVisuals")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    for (const visual of existingVisuals) {
      if (visual.storageId) {
        try {
          await ctx.storage.delete(visual.storageId);
        } catch (e) {
          console.warn(`Failed to delete storage for visual ${visual._id}:`, e);
        }
      }
      await ctx.db.delete(visual._id);
    }

    const visualIdMap = {};
    let diagrams = 0;
    let charts = 0;
    let tables = 0;
    let keyframes = 0;

    for (const v of args.visuals) {
      const docId = await ctx.db.insert("sourceVisuals", {
        ...v,
        userId: source.userId,
        courseId: source.courseId,
        sourceId: args.sourceId,
        processingStatus: v.processingStatus || "ready",
        createdAt: Date.now(),
      });
      visualIdMap[v.visualId] = docId;

      if (["diagram", "flowchart", "architecture", "er_diagram", "state_diagram"].includes(v.visualType)) {
        diagrams++;
      } else if (["chart", "graph"].includes(v.visualType)) {
        charts++;
      } else if (v.visualType === "table") {
        tables++;
      }
      if (v.locationType === "video") {
        keyframes++;
      }
    }

    await ctx.db.patch(args.sourceId, {
      visualStatus: "ready",
      visualCount: args.visuals.length,
      diagramCount: diagrams,
      chartCount: charts,
      tableCount: tables,
      keyframeCount: keyframes,
      visualError: undefined,
      updatedAt: Date.now(),
    });

    return { visualIdMap, count: args.visuals.length };
  },
});

export const deleteVisuals = mutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    const visuals = await ctx.db
      .query("sourceVisuals")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    for (const v of visuals) {
      if (v.storageId) {
        try {
          await ctx.storage.delete(v.storageId);
        } catch (e) {}
      }
      await ctx.db.delete(v._id);
    }

    // Delete visual chunks
    const chunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    for (const c of chunks) {
      if (c.evidenceType === "visual") {
        await ctx.db.delete(c._id);
      }
    }

    // Recalculate remaining chunkCount
    const remainingChunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    await ctx.db.patch(args.sourceId, {
      visualStatus: "not_started",
      visualCount: 0,
      diagramCount: 0,
      chartCount: 0,
      tableCount: 0,
      keyframeCount: 0,
      chunkCount: remainingChunks.length,
      updatedAt: Date.now(),
    });
  },
});
