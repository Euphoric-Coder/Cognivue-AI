import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

export const getSessions = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const sessions = await ctx.db
      .query("tutorSessions")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .order("desc")
      .collect();
      
    return sessions;
  }
});

export const getMessages = query({
  args: { sessionId: v.id("tutorSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    
    const messages = await ctx.db
      .query("tutorMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
      
    return messages;
  }
});

export const getSession = query({
  args: { sessionId: v.id("tutorSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  }
});

export const createSession = mutation({
  args: { 
    courseId: v.id("courses"),
    tutorMode: v.optional(v.string()),
    activeConceptId: v.optional(v.union(v.id("courseConcepts"), v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    return await ctx.db.insert("tutorSessions", {
      userId: user._id,
      courseId: args.courseId,
      tutorMode: args.tutorMode || "adaptive",
      activeHintLevel: 1,
      activeConceptId: args.activeConceptId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
});

export const updateSessionMode = mutation({
  args: {
    sessionId: v.id("tutorSessions"),
    tutorMode: v.optional(v.string()),
    activeHintLevel: v.optional(v.union(v.number(), v.null())),
    activeConceptId: v.optional(v.union(v.id("courseConcepts"), v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    const patch = { updatedAt: Date.now() };
    if (args.tutorMode !== undefined) patch.tutorMode = args.tutorMode;
    if (args.activeHintLevel !== undefined) patch.activeHintLevel = args.activeHintLevel;
    if (args.activeConceptId !== undefined) patch.activeConceptId = args.activeConceptId;
    await ctx.db.patch(args.sessionId, patch);
    return await ctx.db.get(args.sessionId);
  }
});

const citationValidator = v.object({
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
});

export const adaptationValidator = v.optional(v.union(v.object({
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
}), v.null()));

export const addMessage = mutation({
  args: {
    sessionId: v.id("tutorSessions"),
    role: v.string(),
    content: v.string(),
    grounded: v.optional(v.boolean()),
    retrievalStatus: v.optional(v.string()),
    citations: v.optional(v.array(citationValidator)),
    adaptation: adaptationValidator,
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    
    if (args.role === "user" && !session.title) {
      await ctx.db.patch(args.sessionId, {
        title: args.content.substring(0, 40) + (args.content.length > 40 ? "..." : ""),
        updatedAt: Date.now()
      });
    }

    return await ctx.db.insert("tutorMessages", {
      sessionId: args.sessionId,
      userId: session.userId,
      courseId: session.courseId,
      role: args.role,
      content: args.content,
      grounded: args.grounded,
      retrievalStatus: args.retrievalStatus,
      citations: args.citations,
      adaptation: args.adaptation,
      createdAt: Date.now(),
    });
  }
});

export const getChunk = query({
  args: { chunkId: v.id("sourceChunks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.chunkId);
  }
});

export const getVisual = query({
  args: { visualId: v.id("sourceVisuals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.visualId);
  }
});

export const getSource = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sourceId);
  }
});

export const search = action({
  args: {
    courseId: v.id("courses"),
    queryVector: v.array(v.float64()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const results = await ctx.vectorSearch("sourceChunks", "by_embedding", {
      vector: args.queryVector,
      limit: args.limit || 8,
      filter: (q) => q.eq("courseId", args.courseId),
    });
    
    const chunks = [];
    for (const res of results) {
       const doc = await ctx.runQuery(api.tutor.getChunk, { chunkId: res._id });
       if (doc) {
         const source = await ctx.runQuery(api.tutor.getSource, { sourceId: doc.sourceId });
         
         if (!source) {
           console.warn(`RAG_ORPHAN_CHUNK_DISCARDED: chunkId=${doc._id} sourceId=${doc.sourceId}`);
           continue; // Skip this chunk
         }

         let visual = null;
         if (doc.sourceVisualId) {
           visual = await ctx.runQuery(api.tutor.getVisual, { visualId: doc.sourceVisualId });
         }
         
         chunks.push({ 
           ...doc, 
           _score: res._score,
           sourceName: source.name,
           videoDuration: source.durationSeconds,
           imageUrl: visual?.imageUrl,
           visualTitle: visual?.title,
           visualDescription: visual?.description,
           structuredData: visual?.structuredData,
           confidenceNotes: visual?.confidenceNotes,
         });
       }
    }
    return chunks;
  }
});

import { internalMutation } from "./_generated/server";
export const cleanupOrphanedChunks = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const allChunks = await ctx.db.query("sourceChunks").collect();
    let orphanedCount = 0;
    
    for (const chunk of allChunks) {
      const source = await ctx.db.get(chunk.sourceId);
      if (!source) {
        orphanedCount++;
        if (!args.dryRun) {
          await ctx.db.delete(chunk._id);
        }
      }
    }
    console.log(`Orphan scan complete. Orphaned sourceChunks: ${orphanedCount}`);
    return { orphanedChunks: orphanedCount, dryRun: !!args.dryRun };
  }
});

export const updateChunkEmbedding = mutation({
  args: {
    chunkId: v.id("sourceChunks"),
    embedding: v.array(v.float64())
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chunkId, {
      embedding: args.embedding
    });
  }
});

export const getMessagesBackend = query({
  args: { sessionId: v.id("tutorSessions") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("tutorMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
    return messages;
  }
});

export const addMessageBackend = mutation({
  args: {
    sessionId: v.id("tutorSessions"),
    role: v.string(),
    content: v.string(),
    grounded: v.optional(v.boolean()),
    retrievalStatus: v.optional(v.string()),
    citations: v.optional(v.array(citationValidator)),
    adaptation: adaptationValidator,
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;
    return await ctx.db.insert("tutorMessages", {
      sessionId: args.sessionId,
      userId: session.userId,
      courseId: session.courseId,
      role: args.role,
      content: args.content,
      grounded: args.grounded,
      retrievalStatus: args.retrievalStatus,
      citations: args.citations,
      adaptation: args.adaptation,
      createdAt: Date.now(),
    });
  }
});
