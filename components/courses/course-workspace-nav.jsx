"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Library, 
  MessageSquare, 
  FileCheck2, 
  Network, 
  TrendingUp,
  ArrowLeft
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

export function CourseWorkspaceNav({ courseId }) {
  const pathname = usePathname();
  const course = useQuery(api.courses.getCourseById, { courseId });

  const navItems = [
    { name: "Overview", href: `/dashboard/courses/${courseId}`, icon: LayoutDashboard },
    { name: "Sources", href: `/dashboard/courses/${courseId}/sources`, icon: Library },
    { name: "AI Tutor", href: `/dashboard/courses/${courseId}/tutor`, icon: MessageSquare },
    { name: "Assessments", href: `/dashboard/courses/${courseId}/assessments`, icon: FileCheck2 },
    { name: "Knowledge Map", href: `/dashboard/courses/${courseId}/knowledge-map`, icon: Network },
    { name: "Progress", href: `/dashboard/courses/${courseId}/progress`, icon: TrendingUp },
  ];

  const NavLinks = () => (
    <nav className="flex-1 space-y-1 px-3">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}>
            <span className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}>
              <Icon className="h-4 w-4" />
              {item.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile Nav Button */}
      <div className="md:hidden w-full flex items-center p-4 border-b bg-background">
        <Sheet>
          <SheetTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mr-4")}>
            <Menu className="h-4 w-4 mr-2" />
            Course Menu
          </SheetTrigger>
          <SheetContent side="left" className="w-64 pt-10 flex flex-col">
            <div className="px-4 pb-4 border-b mb-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="-ml-3 mb-2 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  All Courses
                </Button>
              </Link>
              <h2 className="font-semibold text-lg line-clamp-2 leading-tight">
                {course ? course.name : "Loading..."}
              </h2>
            </div>
            <NavLinks />
          </SheetContent>
        </Sheet>
        <h2 className="font-semibold text-sm line-clamp-1 flex-1">
          {course ? course.name : "Loading..."}
        </h2>
      </div>

      {/* Desktop Sidebar */}
      <div className="flex-col h-full border-r bg-background w-64 pt-4 shrink-0 hidden md:flex">
        <div className="px-4 pb-4 border-b mb-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="-ml-3 mb-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All Courses
            </Button>
          </Link>
          <h2 className="font-semibold text-lg line-clamp-2 leading-tight">
            {course ? course.name : "Loading..."}
          </h2>
          {course?.subject && (
            <p className="text-xs text-muted-foreground mt-1">{course.subject}</p>
          )}
        </div>
        
        <NavLinks />
      </div>
    </>
  );
}
