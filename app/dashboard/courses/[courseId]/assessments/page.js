import { FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function AssessmentsPage({ params }) {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center space-y-6">
      <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
        <FileCheck2 className="w-10 h-10 text-primary" />
      </div>
      
      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Adaptive Assessments</h2>
        <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">Coming in V0.7</Badge>
      </div>
      
      <p className="text-muted-foreground text-lg">
        Assessments will become available after your course knowledge base has been created.
      </p>
      
      <p className="text-muted-foreground">
        Questions will eventually be grounded in your course sources and adapted to your mastery level.
      </p>
      
      <div className="pt-8">
        <Link href={`/dashboard/courses/${params.courseId}/sources`}>
          <Button size="lg">Manage Sources</Button>
        </Link>
      </div>
    </div>
  );
}
