import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function KnowledgeMapPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] border rounded-2xl bg-card border-dashed relative overflow-hidden">
      
      {/* Decorative background nodes */}
      <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center">
        <svg width="400" height="400" viewBox="0 0 400 400" className="text-primary stroke-current">
          <circle cx="200" cy="50" r="10" fill="currentColor" />
          <circle cx="100" cy="150" r="10" fill="currentColor" />
          <circle cx="300" cy="150" r="10" fill="currentColor" />
          <circle cx="50" cy="250" r="10" fill="currentColor" />
          <circle cx="150" cy="250" r="10" fill="currentColor" />
          <circle cx="250" cy="250" r="10" fill="currentColor" />
          <circle cx="350" cy="250" r="10" fill="currentColor" />
          
          <line x1="200" y1="50" x2="100" y2="150" strokeWidth="2" />
          <line x1="200" y1="50" x2="300" y2="150" strokeWidth="2" />
          
          <line x1="100" y1="150" x2="50" y2="250" strokeWidth="2" />
          <line x1="100" y1="150" x2="150" y2="250" strokeWidth="2" />
          
          <line x1="300" y1="150" x2="250" y2="250" strokeWidth="2" />
          <line x1="300" y1="150" x2="350" y2="250" strokeWidth="2" />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center text-center p-8 bg-background/80 backdrop-blur-sm rounded-xl border max-w-md shadow-sm">
        <Network className="w-12 h-12 text-primary mb-4" />
        
        <h2 className="text-xl font-bold tracking-tight mb-2">Knowledge Map</h2>
        
        <p className="text-muted-foreground text-sm mb-6">
          Your course knowledge map will appear here after Cognivue identifies topics, concepts, and prerequisite relationships.
        </p>
        
        <Badge variant="secondary" className="px-4 py-1">Coming in V0.6</Badge>
      </div>
    </div>
  );
}
