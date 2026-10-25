import { mutation, query, internalMutation } from "./_generated/server";
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

export const getCourseKnowledgeGraph = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) throw new Error("Unauthorized");

    const concepts = await ctx.db
      .query("courseConcepts")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const relationships = await ctx.db
      .query("conceptRelationships")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    return {
      status: course.knowledgeGraphStatus || "not_started",
      error: course.knowledgeGraphError,
      graphVersion: course.graphVersion || 0,
      graphGeneratedAt: course.graphGeneratedAt,
      sourceSnapshotHash: course.sourceSnapshotHash,
      conceptCount: course.conceptCount || concepts.length,
      relationshipCount: course.relationshipCount || relationships.length,
      coreConceptCount: course.coreConceptCount || concepts.filter(c => c.importance === "core").length,
      prerequisiteCount: course.prerequisiteCount || relationships.filter(r => r.relationType === "PREREQUISITE_OF" || r.relationType === "DEPENDS_ON").length,
      concepts,
      relationships,
    };
  },
});

export const getConceptEvidence = query({
  args: { 
    courseId: v.id("courses"),
    conceptId: v.id("courseConcepts") 
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const concept = await ctx.db.get(args.conceptId);
    if (!concept || concept.userId !== user._id) throw new Error("Unauthorized");

    const evidence = await ctx.db
      .query("conceptEvidence")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect();

    return evidence;
  },
});

export const getConceptDetails = query({
  args: { 
    courseId: v.id("courses"),
    conceptId: v.id("courseConcepts") 
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const concept = await ctx.db.get(args.conceptId);
    if (!concept || concept.userId !== user._id) throw new Error("Unauthorized");

    const evidence = await ctx.db
      .query("conceptEvidence")
      .withIndex("by_concept", (q) => q.eq("conceptId", args.conceptId))
      .collect();

    // Outgoing relationships: concept -> other
    const outgoing = await ctx.db
      .query("conceptRelationships")
      .withIndex("by_from_concept", (q) => q.eq("fromConceptId", args.conceptId))
      .collect();

    // Incoming relationships: other -> concept
    const incoming = await ctx.db
      .query("conceptRelationships")
      .withIndex("by_to_concept", (q) => q.eq("toConceptId", args.conceptId))
      .collect();

    // Populate target and source concept names
    const outgoingWithNames = await Promise.all(
      outgoing.map(async (rel) => {
        const toConcept = await ctx.db.get(rel.toConceptId);
        return {
          ...rel,
          toConceptName: toConcept?.name || "Unknown Concept",
          toConceptType: toConcept?.type,
        };
      })
    );

    const incomingWithNames = await Promise.all(
      incoming.map(async (rel) => {
        const fromConcept = await ctx.db.get(rel.fromConceptId);
        return {
          ...rel,
          fromConceptName: fromConcept?.name || "Unknown Concept",
          fromConceptType: fromConcept?.type,
        };
      })
    );

    return {
      concept,
      evidence,
      outgoing: outgoingWithNames,
      incoming: incomingWithNames,
    };
  },
});

export const getCourseGraphMetrics = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) return null;

    return {
      status: course.knowledgeGraphStatus || "not_started",
      error: course.knowledgeGraphError,
      conceptCount: course.conceptCount || 0,
      relationshipCount: course.relationshipCount || 0,
      coreConceptCount: course.coreConceptCount || 0,
      prerequisiteCount: course.prerequisiteCount || 0,
      graphVersion: course.graphVersion || 0,
      graphGeneratedAt: course.graphGeneratedAt,
    };
  },
});

export const markGraphOutdated = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) return;

    if (course.knowledgeGraphStatus === "ready") {
      await ctx.db.patch(args.courseId, {
        knowledgeGraphStatus: "outdated",
        updatedAt: Date.now(),
      });
      console.log(`KG_MARKED_OUTDATED: courseId=${args.courseId}`);
    }
  },
});

export const updateGraphStatusBackend = mutation({
  args: {
    courseId: v.id("courses"),
    status: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) return;

    const patch = {
      knowledgeGraphStatus: args.status,
      updatedAt: Date.now(),
    };
    if (args.error !== undefined) {
      patch.knowledgeGraphError = args.error;
    } else if (args.status === "building" || args.status === "ready") {
      patch.knowledgeGraphError = undefined;
    }

    await ctx.db.patch(args.courseId, patch);
  },
});

export const getBackendEvidenceData = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) return null;

    // Get all ready sources for course
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .filter((q) => q.eq(q.field("status"), "ready"))
      .collect();

    // Get all chunks for course
    const chunks = await ctx.db
      .query("sourceChunks")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    // Get all visuals for course
    const visuals = await ctx.db
      .query("sourceVisuals")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    return {
      course,
      sources,
      chunks,
      visuals,
    };
  },
});

export const saveKnowledgeGraphBackend = mutation({
  args: {
    courseId: v.id("courses"),
    userId: v.id("users"),
    snapshotHash: v.string(),
    concepts: v.array(
      v.object({
        tempId: v.string(),
        name: v.string(),
        normalizedName: v.string(),
        description: v.string(),
        type: v.string(),
        importance: v.string(),
        sourceCount: v.number(),
        evidenceCount: v.number(),
        aliases: v.optional(v.array(v.string())),
        masteryEligible: v.optional(v.boolean()),
      })
    ),
    relationships: v.array(
      v.object({
        fromTempId: v.string(),
        toTempId: v.string(),
        relationType: v.string(),
        confidence: v.string(),
        confidenceScore: v.optional(v.number()),
        explanation: v.optional(v.string()),
        evidenceSummary: v.optional(v.string()),
        evidenceIds: v.optional(v.array(v.string())),
      })
    ),
    evidence: v.array(
      v.object({
        conceptTempId: v.string(),
        sourceId: v.id("sources"),
        sourceName: v.string(),
        evidenceType: v.string(),
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
      })
    ),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    // 1. Transactional delete of old graph data for course
    const existingEvidence = await ctx.db
      .query("conceptEvidence")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const ev of existingEvidence) {
      await ctx.db.delete(ev._id);
    }

    const existingRels = await ctx.db
      .query("conceptRelationships")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const rel of existingRels) {
      await ctx.db.delete(rel._id);
    }

    const existingConcepts = await ctx.db
      .query("courseConcepts")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const c of existingConcepts) {
      await ctx.db.delete(c._id);
    }

    // 2. Insert new concepts and record tempId -> real _id mapping
    const tempToRealConceptId = new Map();
    let coreCount = 0;

    for (const c of args.concepts) {
      if (c.importance === "core") coreCount++;
      const insertedId = await ctx.db.insert("courseConcepts", {
        userId: args.userId,
        courseId: args.courseId,
        name: c.name,
        normalizedName: c.normalizedName,
        description: c.description,
        type: c.type,
        importance: c.importance,
        sourceCount: c.sourceCount,
        evidenceCount: c.evidenceCount,
        aliases: c.aliases || [],
        masteryEligible: c.masteryEligible ?? true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      tempToRealConceptId.set(c.tempId, insertedId);
    }

    // 3. Insert new evidence linked to real conceptId
    for (const ev of args.evidence) {
      const realConceptId = tempToRealConceptId.get(ev.conceptTempId);
      if (!realConceptId) continue;

      await ctx.db.insert("conceptEvidence", {
        userId: args.userId,
        courseId: args.courseId,
        conceptId: realConceptId,
        sourceId: ev.sourceId,
        sourceName: ev.sourceName,
        evidenceType: ev.evidenceType,
        sourceChunkId: ev.sourceChunkId,
        sourceVisualId: ev.sourceVisualId,
        pageNumber: ev.pageNumber,
        slideNumber: ev.slideNumber,
        startTime: ev.startTime,
        endTime: ev.endTime,
        visualType: ev.visualType,
        imageUrl: ev.imageUrl,
        excerpt: ev.excerpt,
        confidence: ev.confidence,
        confidenceScore: ev.confidenceScore,
        createdAt: Date.now(),
      });
    }

    // 4. Insert new relationships linked to real fromConceptId & toConceptId
    let prereqCount = 0;
    for (const r of args.relationships) {
      const fromRealId = tempToRealConceptId.get(r.fromTempId);
      const toRealId = tempToRealConceptId.get(r.toTempId);

      if (!fromRealId || !toRealId || fromRealId === toRealId) continue;

      if (r.relationType === "PREREQUISITE_OF" || r.relationType === "DEPENDS_ON") {
        prereqCount++;
      }

      await ctx.db.insert("conceptRelationships", {
        userId: args.userId,
        courseId: args.courseId,
        fromConceptId: fromRealId,
        toConceptId: toRealId,
        relationType: r.relationType,
        confidence: r.confidence,
        confidenceScore: r.confidenceScore,
        explanation: r.explanation,
        evidenceSummary: r.evidenceSummary,
        evidenceIds: r.evidenceIds || [],
        createdAt: Date.now(),
      });
    }

    // 5. Update course status
    const currentVersion = course.graphVersion || 0;
    await ctx.db.patch(args.courseId, {
      knowledgeGraphStatus: "ready",
      knowledgeGraphError: undefined,
      conceptCount: args.concepts.length,
      relationshipCount: args.relationships.length,
      coreConceptCount: coreCount,
      prerequisiteCount: prereqCount,
      sourceSnapshotHash: args.snapshotHash,
      graphGeneratedAt: Date.now(),
      graphVersion: currentVersion + 1,
      updatedAt: Date.now(),
    });

    console.log(
      `KG_BUILD_COMPLETE: courseId=${args.courseId}, concepts=${args.concepts.length}, relationships=${args.relationships.length}, evidence=${args.evidence.length}, version=${currentVersion + 1}`
    );

    return {
      success: true,
      conceptsCount: args.concepts.length,
      relationshipsCount: args.relationships.length,
      evidenceCount: args.evidence.length,
      graphVersion: currentVersion + 1,
    };
  },
});
