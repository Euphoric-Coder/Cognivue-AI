"use client";

import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Library, Target, Flame, Sparkles } from "lucide-react";
import { CreateCourseDialog } from "@/components/dashboard/create-course-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCard } from "@/components/dashboard/course-card";

export default function DashboardPage() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const courses = useQuery(api.courses.getUserCourses, isAuthenticated ? {} : "skip");

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-10 max-w-7xl mx-auto px-4 md:px-6 relative">
      {/* Decorative ambient dashboard background */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full mix-blend-multiply filter blur-[120px] opacity-50 pointer-events-none" />
      <div className="absolute top-40 -left-20 w-72 h-72 bg-blue-500/10 rounded-full mix-blend-multiply filter blur-[100px] opacity-50 pointer-events-none" />

      <div className="relative z-10 pt-6">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary mb-4 backdrop-blur-md shadow-sm">
          <Sparkles className="mr-2 h-3 w-3" />
          <span>Your Learning Workspace</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          {getGreeting()}, <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">{user?.firstName || "Learner"}</span>
        </h1>
        <p className="text-muted-foreground mt-3 text-lg font-medium max-w-2xl">
          Continue your journey. Organize your courses and track your mastery all in one place.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 relative z-10">
        <Card className="bg-card/50 backdrop-blur-xl border-white/5 shadow-lg hover:shadow-xl hover:border-primary/20 transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-foreground/80 group-hover:text-primary transition-colors">Active Courses</CardTitle>
            <div className="p-2 rounded-xl bg-primary/10 group-hover:scale-110 transition-transform">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              {courses === undefined ? <Skeleton className="h-9 w-12" /> : courses.filter(c => c.status === "active").length}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur-xl border-white/5 shadow-lg hover:shadow-xl transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-foreground/80">Learning Sources</CardTitle>
            <div className="p-2 rounded-xl bg-blue-500/10 group-hover:scale-110 transition-transform">
              <Library className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground/50">—</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Across all courses</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur-xl border-white/5 shadow-lg hover:shadow-xl transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-foreground/80">Topics Mastered</CardTitle>
            <div className="p-2 rounded-xl bg-purple-500/10 group-hover:scale-110 transition-transform">
              <Target className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground/50">—</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Coming in V0.8</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur-xl border-white/5 shadow-lg hover:shadow-xl transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-foreground/80">Learning Streak</CardTitle>
            <div className="p-2 rounded-xl bg-orange-500/10 group-hover:scale-110 transition-transform">
              <Flame className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground/50">—</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Start learning to build streak</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 relative z-10 bg-background/20 rounded-3xl p-6 md:p-8 border border-white/5 backdrop-blur-md shadow-2xl">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Your Courses</h2>
            <p className="text-sm text-muted-foreground mt-1">Jump right back into your active workspaces.</p>
          </div>
          <CreateCourseDialog />
        </div>

        {courses === undefined ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-48 bg-card/40 border-white/5">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 bg-muted/50" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2 bg-muted/50" />
                  <Skeleton className="h-4 w-2/3 bg-muted/50" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-primary/20 rounded-3xl bg-primary/5">
            <div className="rounded-full bg-background p-4 mb-6 shadow-xl shadow-primary/10">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">No courses yet</h3>
            <p className="text-base text-muted-foreground mb-8 max-w-sm mt-2">
              Create your first course and start building your personalized learning workspace.
            </p>
            <CreateCourseDialog />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {courses.filter(c => c.status !== "archived").map((course) => (
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
