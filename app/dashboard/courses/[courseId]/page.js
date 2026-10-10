"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Library, Network, Target, MessageSquare, CheckCircle2, Circle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CourseOverviewPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;
  const course = useQuery(api.courses.getCourseById, { courseId });
  const sources = useQuery(api.sources.getCourseSources, { courseId });

  if (course === undefined || sources === undefined) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-1/3" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  const hasSources = sources.length > 0;
  const processedSourcesCount = sources.filter(s => s.status === 'ready').length;
  const totalChunks = sources.reduce((acc, s) => acc + (s.chunkCount || 0), 0);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Course Overview</h2>
        <p className="text-muted-foreground mt-1">
          {course.description || "Welcome to your course workspace."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Learning Sources</CardTitle>
            <Library className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sources.length}</div>
            <Link href={`/dashboard/courses/${courseId}/sources`} className="text-xs text-primary hover:underline mt-1 inline-block">
              Manage sources
            </Link>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processed Sources</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{processedSourcesCount}</div>
            <p className="text-xs text-muted-foreground">Successfully ingested</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Extracted Chunks</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalChunks}</div>
            <p className="text-xs text-muted-foreground">Ready for knowledge base</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI-Ready Sources</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sources.filter(s => s.ragStatus === 'ready').length}</div>
            <p className="text-xs text-muted-foreground">Available for AI Tutor</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Course created</p>
                <p className="text-sm text-muted-foreground">You've successfully set up the workspace.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              {hasSources ? (
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Upload learning sources</p>
                <p className="text-sm text-muted-foreground">Add PDFs, slides, and videos to start building knowledge.</p>
                {!hasSources && (
                  <Link href={`/dashboard/courses/${courseId}/sources`}>
                    <Button variant="outline" size="sm" className="mt-2">Upload Now</Button>
                  </Link>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              {processedSourcesCount > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Process first source</p>
                <p className="text-sm text-muted-foreground">Extract text and chunks from a document.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 opacity-60">
              <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Build knowledge base</p>
                <p className="text-sm text-muted-foreground">Coming in V3.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 opacity-60">
              <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Ask your first question</p>
                <p className="text-sm text-muted-foreground">Coming in V0.3.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 opacity-60">
              <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Take your first assessment</p>
                <p className="text-sm text-muted-foreground">Coming in V0.7.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-4">No sources uploaded yet.</p>
                <Link href={`/dashboard/courses/${courseId}/sources`}>
                  <Button variant="secondary" size="sm">Add Materials</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {sources.slice(0, 5).map(source => (
                  <div key={source._id} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                    <div className="space-y-1 overflow-hidden">
                      <p className="text-sm font-medium leading-none truncate">{source.name}</p>
                      <div className="flex items-center text-xs text-muted-foreground gap-2">
                        <span className="uppercase">{source.type}</span>
                        <span>•</span>
                        <span>{(source.size / (1024 * 1024)).toFixed(1)} MB</span>
                      </div>
                    </div>
                    <div className="text-xs bg-muted px-2 py-1 rounded-md ml-2 shrink-0">
                      {source.status}
                    </div>
                  </div>
                ))}
                {sources.length > 5 && (
                  <Link href={`/dashboard/courses/${courseId}/sources`} className="block text-center pt-2">
                    <Button variant="ghost" size="sm" className="text-xs">View all {sources.length} sources</Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
