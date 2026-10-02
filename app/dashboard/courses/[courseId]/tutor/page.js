import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";

export default function TutorPage({ params }) {
  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto">
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border rounded-2xl bg-card border-dashed mb-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <MessageSquare className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-3">AI Tutor</h2>
        <p className="text-muted-foreground max-w-md mb-8">
          Your source-grounded tutor will become available after Cognivue processes your course materials.
        </p>
        
        <div className="text-left bg-muted/30 p-6 rounded-xl border w-full max-w-sm mb-8 space-y-3">
          <h4 className="font-semibold text-sm">Future capabilities:</h4>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start">
              <span className="mr-2">•</span> Ask questions about your course
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span> Receive page, slide and timestamp citations
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span> Switch between tutor modes
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span> Review weak concepts
            </li>
          </ul>
        </div>
        
        <Link href={`/dashboard/courses/${params.courseId}/sources`}>
          <Button variant="outline">Go to Sources</Button>
        </Link>
      </div>

      <div className="relative">
        <div className="absolute -top-3 left-4 bg-background px-2 text-xs font-medium text-primary">
          Coming in V0.3
        </div>
        <div className="flex gap-2">
          <Input 
            placeholder="Ask something about your course..." 
            disabled 
            className="flex-1 rounded-full bg-muted/20 border-dashed"
          />
          <Button disabled className="rounded-full px-6">Send</Button>
        </div>
      </div>
    </div>
  );
}
