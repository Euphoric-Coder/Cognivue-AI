"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, MoreVertical, Archive, Trash2, Edit2 } from "lucide-react";
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

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this course? This action cannot be undone.")) {
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

  return (
    <Card className="flex flex-col h-full hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-md">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <CardTitle className="text-xl line-clamp-1">{course.name}</CardTitle>
          </div>
          {course.subject && (
            <Badge variant="secondary" className="mt-2 font-normal">
              {course.subject}
            </Badge>
          )}
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
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-muted-foreground">
          <div>
            <div className="font-medium text-foreground mb-1">Knowledge Base</div>
            <span className="text-xs">Not processed yet</span>
          </div>
          <div>
            <div className="font-medium text-foreground mb-1">Mastery</div>
            <span className="text-xs">Not available yet</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-4 border-t">
        <Link href={`/dashboard/courses/${course._id}`} className="w-full">
          <Button variant="secondary" className="w-full">Open Course</Button>
        </Link>
      </CardFooter>
      <EditCourseDialog course={course} open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} />
    </Card>
  );
}
