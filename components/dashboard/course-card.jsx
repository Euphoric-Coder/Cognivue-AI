"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, MoreVertical, Archive, Trash2, Edit2, Sparkles, Network } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { EditCourseDialog } from "@/components/dashboard/edit-course-dialog";

export function CourseCard({ course }) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const deleteCourse = useMutation(api.courses.deleteCourse);
  const archiveCourse = useMutation(api.courses.archiveCourse);

  // Safely query learner summary for this course
  const learnerSummary = useQuery(api.learnerModel.getCourseLearnerSummary, { courseId: course._id });

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this course? All associated sources, chunks, assessments, and study data will be removed.")) {
      try {
        await deleteCourse({ courseId: course._id });
        toast.success("Course deleted successfully.");
      } catch (e) {
        toast.error("Failed to delete course.");
      }
    }
  };

  const handleArchive = async () => {
    try {
      await archiveCourse({ courseId: course._id });
      toast.success("Course archived.");
    } catch (e) {
      toast.error("Failed to archive course.");
    }
  };

  const getKnowledgeBaseStatus = () => {
    if (course.conceptCount && course.conceptCount > 0) {
      return `${course.conceptCount} concepts indexed`;
    }
    if (course.knowledgeGraphStatus === "ready") {
      return "Knowledge graph ready";
    }
    if (course.knowledgeGraphStatus === "building") {
      return "Extracting concepts...";
    }
    return "Sources ready for graph";
  };

  const getMasteryDisplay = () => {
    if (learnerSummary && learnerSummary.overallMastery !== undefined && learnerSummary.totalConcepts > 0) {
      return `${learnerSummary.overallMastery}% (${learnerSummary.masteryBand || "developing"})`;
    }
    if (course.isDemo) {
      return "59% (developing)";
    }
    return "Take first assessment";
  };

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-all border-border/50 bg-card/70 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="space-y-1.5 flex-1 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <CardTitle className="text-lg font-bold line-clamp-1">{course.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {course.isDemo && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/10 font-semibold text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                Demo Course
              </Badge>
            )}
            {course.courseCode && (
              <Badge variant="secondary" className="font-mono text-xs">
                {course.courseCode}
              </Badge>
            )}
            {course.subject && (
              <Badge variant="outline" className="font-normal text-xs text-muted-foreground">
                {course.subject}
              </Badge>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", className: "h-8 w-8 p-0 -mr-2" })}>
            <span className="sr-only">Open menu</span>
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit Course
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
          {course.description || "No description provided."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs p-3 rounded-xl bg-muted/40 border border-border/40">
          <div>
            <div className="font-medium text-foreground mb-0.5 flex items-center gap-1">
              <Network className="w-3 h-3 text-primary" />
              <span>Knowledge Base</span>
            </div>
            <span className="text-muted-foreground font-medium">{getKnowledgeBaseStatus()}</span>
          </div>
          <div>
            <div className="font-medium text-foreground mb-0.5">Mastery</div>
            <span className="text-muted-foreground font-medium">{getMasteryDisplay()}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-3 border-t border-border/40">
        <Link href={`/dashboard/courses/${course._id}`} className="w-full">
          <Button variant="secondary" className="w-full font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
            Open Course Workspace
          </Button>
        </Link>
      </CardFooter>
      <EditCourseDialog course={course} open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} />
    </Card>
  );
}
