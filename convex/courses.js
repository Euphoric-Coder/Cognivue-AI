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

export const deleteCourse = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    
    if (!course || course.userId !== user._id) throw new Error("Unauthorized");
    
    // First delete all sources for this course
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
      
    for (const source of sources) {
      if (source.storageId) {
        await ctx.storage.delete(source.storageId);
      }
      await ctx.db.delete(source._id);
    }

    // Cascade delete V6 Knowledge Graph tables
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

    // Cascade delete V7 Assessment Engine tables
    const existingResponses = await ctx.db
      .query("assessmentResponses")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const r of existingResponses) {
      await ctx.db.delete(r._id);
    }

    const existingAttempts = await ctx.db
      .query("assessmentAttempts")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const a of existingAttempts) {
      await ctx.db.delete(a._id);
    }

    const existingQuestions = await ctx.db
      .query("assessmentQuestions")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const q of existingQuestions) {
      await ctx.db.delete(q._id);
    }

    const existingAssessments = await ctx.db
      .query("assessments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    for (const ass of existingAssessments) {
      await ctx.db.delete(ass._id);
    }

    // Cascade delete V8 Learner Model tables
    const existingObservations = await ctx.db
      .query("learnerObservations")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .collect();
    for (const obs of existingObservations) {
      await ctx.db.delete(obs._id);
    }

    const existingStates = await ctx.db
      .query("learnerConceptStates")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .collect();
    for (const state of existingStates) {
      await ctx.db.delete(state._id);
    }

    const existingSnapshots = await ctx.db
      .query("learnerMasterySnapshots")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .collect();
    for (const snap of existingSnapshots) {
      await ctx.db.delete(snap._id);
    }

    // Cascade delete V9 Adaptive Tutor tables
    const existingMisconceptions = await ctx.db
      .query("learnerMisconceptions")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .collect();
    for (const misc of existingMisconceptions) {
      await ctx.db.delete(misc._id);
    }

    const existingAdaptationEvents = await ctx.db
      .query("tutorAdaptationEvents")
      .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", args.courseId))
      .collect();
    for (const evt of existingAdaptationEvents) {
      await ctx.db.delete(evt._id);
    }

    // Cascade delete Tutor sessions and messages
    const existingSessions = await ctx.db
      .query("tutorSessions")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
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
    
    // Delete the course
    await ctx.db.delete(args.courseId);
  },
});
