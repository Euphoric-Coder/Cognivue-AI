import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export async function getCurrentUser(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireUser(ctx) {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export const getUserCourses = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    
    // Sort by creation date descending
    return courses.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getCourseById = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== user._id) return null;
    
    return course;
  },
});

export const getCourse = getCourseById;

export const createCourse = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    subject: v.optional(v.string()),
    courseCode: v.optional(v.string()),
    academicLevel: v.optional(v.string()),
    isDemo: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    
    const courseId = await ctx.db.insert("courses", {
      userId: user._id,
      name: args.name,
      description: args.description,
      subject: args.subject,
      courseCode: args.courseCode,
      academicLevel: args.academicLevel,
      status: "active",
      isDemo: args.isDemo || false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return courseId;
  },
});

export const updateCourse = mutation({
  args: {
    courseId: v.id("courses"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    subject: v.optional(v.string()),
    courseCode: v.optional(v.string()),
    academicLevel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    
    if (!course || course.userId !== user._id) throw new Error("Unauthorized");
    
    const updates = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.subject !== undefined) updates.subject = args.subject;
    if (args.courseCode !== undefined) updates.courseCode = args.courseCode;
    if (args.academicLevel !== undefined) updates.academicLevel = args.academicLevel;
    
    await ctx.db.patch(args.courseId, updates);
  },
});

export const archiveCourse = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    
    if (!course || course.userId !== user._id) throw new Error("Unauthorized");
    
    await ctx.db.patch(args.courseId, { 
      status: "archived",
      updatedAt: Date.now() 
    });
  },
});

export async function cascadeDeleteCourse(ctx, courseId, userId) {
  // 1. Delete source chunks, transcript segments, and visuals
  const chunks = await ctx.db
    .query("sourceChunks")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const chk of chunks) {
    await ctx.db.delete(chk._id);
  }

  const segments = await ctx.db
    .query("transcriptSegments")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const seg of segments) {
    await ctx.db.delete(seg._id);
  }

  const visuals = await ctx.db
    .query("sourceVisuals")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const vis of visuals) {
    if (vis.storageId) {
      try {
        await ctx.storage.delete(vis.storageId);
      } catch (_) {}
    }
    await ctx.db.delete(vis._id);
  }

  // 2. Delete all sources for this course
  const sources = await ctx.db
    .query("sources")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
    
  for (const source of sources) {
    if (source.storageId) {
      try {
        await ctx.storage.delete(source.storageId);
      } catch (_) {}
    }
    await ctx.db.delete(source._id);
  }

  // 3. Cascade delete V6 Knowledge Graph tables
  const existingEvidence = await ctx.db
    .query("conceptEvidence")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const ev of existingEvidence) {
    await ctx.db.delete(ev._id);
  }

  const existingRels = await ctx.db
    .query("conceptRelationships")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const rel of existingRels) {
    await ctx.db.delete(rel._id);
  }

  const existingConcepts = await ctx.db
    .query("courseConcepts")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const c of existingConcepts) {
    await ctx.db.delete(c._id);
  }

  // 4. Cascade delete V7 Assessment Engine tables
  const existingResponses = await ctx.db
    .query("assessmentResponses")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const r of existingResponses) {
    await ctx.db.delete(r._id);
  }

  const existingAttempts = await ctx.db
    .query("assessmentAttempts")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const a of existingAttempts) {
    await ctx.db.delete(a._id);
  }

  const existingQuestions = await ctx.db
    .query("assessmentQuestions")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const q of existingQuestions) {
    await ctx.db.delete(q._id);
  }

  const existingAssessments = await ctx.db
    .query("assessments")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const ass of existingAssessments) {
    await ctx.db.delete(ass._id);
  }

  // 5. Cascade delete V8 Learner Model tables
  const existingObservations = await ctx.db
    .query("learnerObservations")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const obs of existingObservations) {
    await ctx.db.delete(obs._id);
  }

  const existingStates = await ctx.db
    .query("learnerConceptStates")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const state of existingStates) {
    await ctx.db.delete(state._id);
  }

  const existingSnapshots = await ctx.db
    .query("learnerMasterySnapshots")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const snap of existingSnapshots) {
    await ctx.db.delete(snap._id);
  }

  // 6. Cascade delete V9 Adaptive Tutor tables
  const existingMisconceptions = await ctx.db
    .query("learnerMisconceptions")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const misc of existingMisconceptions) {
    await ctx.db.delete(misc._id);
  }

  const existingAdaptationEvents = await ctx.db
    .query("tutorAdaptationEvents")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const evt of existingAdaptationEvents) {
    await ctx.db.delete(evt._id);
  }

  // 7. Cascade delete Tutor sessions and messages
  const existingSessions = await ctx.db
    .query("tutorSessions")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const s of existingSessions) {
    const messages = await ctx.db
      .query("tutorMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", s._id))
      .collect();
    for (const m of messages) {
      await ctx.db.delete(m._id);
    }
    await ctx.db.delete(s._id);
  }

  // 8. Cascade delete V10 Study Intelligence tables
  const existingRecs = await ctx.db
    .query("studyRecommendations")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  for (const rec of existingRecs) {
    await ctx.db.delete(rec._id);
  }

  const existingPlanItems = await ctx.db
    .query("studyPlanItems")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const pi of existingPlanItems) {
    await ctx.db.delete(pi._id);
  }

  const existingPlans = await ctx.db
    .query("studyPlans")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const sp of existingPlans) {
    await ctx.db.delete(sp._id);
  }

  const existingReviewStates = await ctx.db
    .query("conceptReviewStates")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const crs of existingReviewStates) {
    await ctx.db.delete(crs._id);
  }

  const existingActivityEvents = await ctx.db
    .query("studyActivityEvents")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  for (const sae of existingActivityEvents) {
    await ctx.db.delete(sae._id);
  }
  
  // 9. Delete the course
  await ctx.db.delete(courseId);
}

export const deleteCourse = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    
    if (!course || course.userId !== user._id) throw new Error("Unauthorized");
    
    await cascadeDeleteCourse(ctx, args.courseId, user._id);
  },
});
