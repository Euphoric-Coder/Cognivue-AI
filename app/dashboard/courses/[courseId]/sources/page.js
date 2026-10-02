"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { use } from "react";
import { SourceUploader } from "@/components/sources/source-uploader";
import { SourceList } from "@/components/sources/source-list";
import { Library } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SourcesPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;
  const sources = useQuery(api.sources.getCourseSources, { courseId });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Learning Sources</h2>
        <p className="text-muted-foreground mt-1">
          Upload and manage the materials for this course.
        </p>
      </div>

      <SourceUploader courseId={courseId} />

      <div>
        <h3 className="text-lg font-medium mb-4">Course Materials</h3>
        
        {sources === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center py-12 border rounded-xl border-dashed bg-muted/10">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Library className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No sources uploaded</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Your uploaded files will appear here. Start by adding some materials above.
            </p>
          </div>
        ) : (
          <SourceList courseId={courseId} />
        )}
      </div>
    </div>
  );
}
