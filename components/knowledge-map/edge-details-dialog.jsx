"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Link2, ShieldCheck, FileText } from "lucide-react";

export function EdgeDetailsDialog({ edge, onClose, courseId }) {
  if (!edge) return null;

  const isPrereq = edge.relationType === "PREREQUISITE_OF" || edge.relationType === "DEPENDS_ON";

  return (
    <Dialog open={!!edge} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Link2 className="w-5 h-5 text-primary shrink-0" />
            <span>Relationship Provenance</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Connection Visual Header */}
          <div className="flex items-center justify-between p-3.5 bg-muted/40 rounded-xl border">
            <div className="flex-1 text-center font-medium text-sm truncate px-2">
              {edge.fromConceptName}
            </div>
            
            <div className="flex flex-col items-center px-2 shrink-0">
              <Badge 
                variant={isPrereq ? "default" : "secondary"} 
                className={`text-[10px] tracking-wider uppercase font-semibold ${
                  isPrereq ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
                }`}
              >
                {edge.relationType.replace(/_/g, " ")}
              </Badge>
              <ArrowRight className="w-4 h-4 text-muted-foreground mt-1" />
            </div>

            <div className="flex-1 text-center font-medium text-sm truncate px-2">
              {edge.toConceptName}
            </div>
          </div>

          {/* Explanation */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Educational Connection
            </h4>
            <p className="text-sm leading-relaxed bg-card p-3 rounded-lg border text-foreground">
              {edge.explanation || "These concepts are semantically connected based on course material analysis."}
            </p>
          </div>

          {/* Supporting Evidence */}
          {edge.evidenceSummary && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Supporting Course Evidence
              </h4>
              <div className="text-xs leading-relaxed font-mono bg-muted/30 p-3 rounded-lg border text-muted-foreground whitespace-pre-wrap">
                &ldquo;{edge.evidenceSummary}&rdquo;
              </div>
            </div>
          )}

          {/* Confidence footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Confidence: <strong className="capitalize text-foreground">{edge.confidence || "high"}</strong>
            </span>
            <span className="text-[11px] italic">
              Verified by Course Knowledge Graph
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
