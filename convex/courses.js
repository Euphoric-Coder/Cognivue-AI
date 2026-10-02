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

export const getUserCourses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
      
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
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    
    if (!course) throw new Error("Course not found");
    if (course.userId !== user._id) throw new Error("Unauthorized access to course");
    
    return course;
  },
});

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
      // In a real implementation we would also delete the file from storage
      if (source.storageId) {
        await ctx.storage.delete(source.storageId);
      }
      await ctx.db.delete(source._id);
    }
    
    // Delete the course
    await ctx.db.delete(args.courseId);
  },
});
