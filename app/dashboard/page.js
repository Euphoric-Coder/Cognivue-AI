"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Library, Target, Flame, Sparkles, Network, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCourseDialog } from "@/components/dashboard/create-course-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCard } from "@/components/dashboard/course-card";
import { toast } from "sonner";

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const courses = useQuery(api.courses.getUserCourses, isAuthenticated ? {} : "skip");
  const demoCourse = useQuery(api.demo.getDemoCourse, isAuthenticated ? {} : "skip");
  const getOrCreateDemo = useMutation(api.demo.getOrCreateDemoCourse);

  const [isLaunchingDemo, setIsLaunchingDemo] = useState(false);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const handleLaunchDemo = async () => {
    try {
      setIsLaunchingDemo(true);
      const demoId = await getOrCreateDemo({});
      toast.success("Demo course ready! Loading workspace...");
      router.push(`/dashboard/courses/${demoId}`);
    } catch (err) {
      console.error("Failed to launch demo course:", err);
      toast.error("Failed to launch demo course. Please try again.");
      setIsLaunchingDemo(false);
    }
  };

  // Compute aggregated stats
  const activeCourses = courses?.filter((c) => c.status === "active") || [];
  const totalConcepts = courses?.reduce((acc, c) => acc + (c.conceptCount || 0), 0) || 0;
  const hasDemoCourse = Boolean(demoCourse);

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 md:px-6 relative pb-16">
      {/* Decorative ambient dashboard background */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full mix-blend-multiply filter blur-[120px] opacity-50 pointer-events-none" />
      <div className="absolute top-40 -left-20 w-72 h-72 bg-blue-500/10 rounded-full mix-blend-multiply filter blur-[100px] opacity-50 pointer-events-none" />

      {/* Greeting Header */}
      <div className="relative z-10 pt-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary mb-3 backdrop-blur-md shadow-sm">
            <Sparkles className="mr-2 h-3 w-3" />
            <span>Multimodal Learning Workspace</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            {getGreeting()},{" "}
            <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              {user?.firstName || "Learner"}
            </span>
          </h1>
          <p className="text-muted-foreground mt-2 text-base max-w-2xl">
            Welcome to Cognivue. Upload courses, ask your grounded tutor, explore knowledge maps, and track your personalized study plan.
          </p>
        </div>

        {/* Demo Course Quick-Launch CTA */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleLaunchDemo}
            disabled={isLaunchingDemo}
            variant="outline"
            className="rounded-full border-primary/30 hover:border-primary/70 bg-primary/5 hover:bg-primary/10 text-primary font-semibold shadow-sm"
          >
            {isLaunchingDemo ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Preparing Demo...
              </>
            ) : (
              <>
                <Flame className="w-4 h-4 mr-2 text-orange-500" />
                {hasDemoCourse ? "Open Demo Course" : "Explore Demo Course"}
              </>
            )}
          </Button>
          <CreateCourseDialog />
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 relative z-10">
        <Card className="bg-card/50 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Courses
            </CardTitle>
            <div className="p-2 rounded-xl bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {courses === undefined ? <Skeleton className="h-8 w-12" /> : activeCourses.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Available learning workspaces</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Knowledge Graph
            </CardTitle>
            <div className="p-2 rounded-xl bg-blue-500/10">
              <Network className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {courses === undefined ? <Skeleton className="h-8 w-12" /> : totalConcepts}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Indexed course concepts</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Learning System
            </CardTitle>
            <div className="p-2 rounded-xl bg-purple-500/10">
              <Target className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">Adaptive</div>
            <p className="text-xs text-muted-foreground mt-1">Socratic & diagnostic active</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Study Intelligence
            </CardTitle>
            <div className="p-2 rounded-xl bg-orange-500/10">
              <Flame className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">Personalized</div>
            <p className="text-xs text-muted-foreground mt-1">Daily priorities & spaced review</p>
          </CardContent>
        </Card>
      </div>

      {/* Demo Course Callout Banner if no demo created yet */}
      {!hasDemoCourse && courses && courses.length === 0 && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-purple-500/10 to-transparent border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <h3 className="font-bold text-foreground text-lg">Try the Pre-Loaded Hackathon Demo Course</h3>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Experience Cognivue immediately with sample Calculus & Neural Networks materials, PDF notes, PPTX slides, timestamped video transcript, and adaptive study plans.
            </p>
          </div>
          <Button
            onClick={handleLaunchDemo}
            disabled={isLaunchingDemo}
            className="rounded-full px-6 font-semibold shadow-md whitespace-nowrap"
          >
            {isLaunchingDemo ? "Loading..." : "Launch Demo Course"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Course List Section */}
      <div className="space-y-6 relative z-10 bg-card/40 rounded-3xl p-6 md:p-8 border border-border/50 backdrop-blur-md shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Your Courses</h2>
            <p className="text-sm text-muted-foreground mt-1">Jump right back into your active workspaces.</p>
          </div>
        </div>

        {courses === undefined ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-48 bg-card/40 border-border/40">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-primary/20 rounded-2xl bg-primary/5 space-y-4">
            <div className="rounded-full bg-background p-4 shadow-md">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-foreground">No courses yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create your first course or explore our pre-built multimodal demo course to test the full system right now.
            </p>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleLaunchDemo} disabled={isLaunchingDemo} variant="outline" className="rounded-full">
                <Flame className="w-4 h-4 mr-2 text-orange-500" />
                Explore Demo Course
              </Button>
              <CreateCourseDialog />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {courses
              .filter((c) => c.status !== "archived")
              .map((course) => (
                <div key={course._id} className="transition-all duration-300 hover:-translate-y-1">
                  <CourseCard course={course} />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
