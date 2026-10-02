import { CourseWorkspaceNav } from "@/components/courses/course-workspace-nav";

export default async function CourseLayout({ children, params }) {
  const { courseId } = await params;

  return (
    <div className="flex flex-col md:flex-row -m-4 md:-m-6 lg:-m-8 h-[calc(100vh-4rem)]">
      <CourseWorkspaceNav courseId={courseId} />
      <div className="flex-1 overflow-y-auto bg-background/50 p-4 md:p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
}
