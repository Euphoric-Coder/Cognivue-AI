"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MessageSquare, 
  ArrowRight, 
  FileText, 
  Video, 
  Image as ImageIcon, 
  ExternalLink,
  Layers,
  Sparkles,
  BookOpen,
  Target
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatSlideNumber, formatTimestamp } from "@/lib/utils";

export function ConceptDetailsSheet({ concept, courseId, onClose, onSelectConcept }) {
  const router = useRouter();

  const details = useQuery(
    api.knowledgeGraph.getConceptDetails,
    concept ? { courseId, conceptId: concept._id } : "skip"
  );

  const learnerState = useQuery(
    api.learnerModel.getConceptLearnerDetails,
    concept ? { courseId, conceptId: concept._id } : "skip"
  );

  if (!concept) return null;

  const handleAskTutor = () => {
    const q = `Explain ${concept.name} using my course materials.`;
    router.push(
      `/dashboard/courses/${courseId}/tutor?initialQuestion=${encodeURIComponent(q)}&focusConceptId=${concept._id}`
    );
  };

  const isCore = concept.importance === "core";

  return (
    <Sheet open={!!concept} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[90vw] sm:w-[480px] p-0 flex flex-col h-full bg-background border-l">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b bg-muted/20">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge 
              variant={isCore ? "default" : "secondary"}
              className={`text-xs uppercase tracking-wider font-semibold ${
                isCore ? "bg-primary text-primary-foreground shadow-xs" : ""
              }`}
            >
              {concept.importance}
            </Badge>

            <Badge variant="outline" className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
              {concept.type}
            </Badge>

            {concept.sourceCount > 0 && (
              <span className="text-[11px] text-muted-foreground ml-auto">
                {concept.sourceCount} {concept.sourceCount === 1 ? "source" : "sources"} · {concept.evidenceCount} evidence
              </span>
            )}
          </div>

          <SheetTitle className="text-xl font-bold tracking-tight text-foreground">
            {concept.name}
          </SheetTitle>

          {concept.aliases && concept.aliases.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium text-foreground">Also known as:</span> {concept.aliases.join(", ")}
            </p>
          )}

          {/* Ask Tutor Action */}
          <div className="pt-3">
            <Button 
              size="sm" 
              className="w-full flex items-center justify-center gap-2 font-medium shadow-sm"
              onClick={handleAskTutor}
            >
              <MessageSquare className="w-4 h-4" />
              Ask AI Tutor About This Concept
            </Button>
          </div>
        </SheetHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              Overview & Definition
            </h4>
            <div className="p-4 rounded-xl bg-card border text-sm leading-relaxed text-foreground shadow-xs">
              {concept.description}
            </div>
          </div>

          {/* V8 Concept Mastery */}
          <div className="p-4 rounded-xl bg-card border shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-primary" />
                Learner Mastery
              </h4>
              <Link href={`/dashboard/courses/${courseId}/progress`}>
                <span className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-1">
                  View Progress <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </div>

            {learnerState === undefined ? (
              <Skeleton className="h-14 w-full rounded-lg" />
            ) : learnerState && learnerState.hasEvidence ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-primary">
                      {Math.round(learnerState.masteryProbability * 100)}%
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                      {learnerState.masteryBand.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground capitalize">
                    {learnerState.confidence} confidence
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Backed by <strong>{learnerState.evidenceCount}</strong> graded response{learnerState.evidenceCount === 1 ? "" : "s"}.
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-1">
                No assessment evidence recorded for this concept yet.
              </div>
            )}
          </div>

          {/* Relationships */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" />
              Connected Knowledge
            </h4>

            {!details ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Outgoing */}
                {details.outgoing && details.outgoing.map((rel) => {
                  const isPrereq = rel.relationType === "PREREQUISITE_OF" || rel.relationType === "DEPENDS_ON";
                  return (
                    <div 
                      key={rel._id}
                      className="p-3 bg-muted/40 hover:bg-muted/70 rounded-xl border transition-colors flex items-center justify-between text-xs cursor-pointer group"
                      onClick={() => onSelectConcept && onSelectConcept(rel.toConceptId)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge 
                          variant={isPrereq ? "default" : "secondary"}
                          className={`text-[9px] uppercase tracking-wider shrink-0 font-semibold ${
                            isPrereq ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
                          }`}
                        >
                          {rel.relationType.replace(/_/g, " ")}
                        </Badge>
                        <span className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {rel.toConceptName}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  );
                })}

                {/* Incoming */}
                {details.incoming && details.incoming.map((rel) => {
                  return (
                    <div 
                      key={rel._id}
                      className="p-3 bg-muted/30 hover:bg-muted/60 rounded-xl border transition-colors flex items-center justify-between text-xs cursor-pointer group"
                      onClick={() => onSelectConcept && onSelectConcept(rel.fromConceptId)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground shrink-0 font-medium text-[11px]">is targeted by</span>
                        <span className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {rel.fromConceptName}
                        </span>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider shrink-0 text-muted-foreground">
                          {rel.relationType.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  );
                })}

                {(!details.outgoing || details.outgoing.length === 0) && (!details.incoming || details.incoming.length === 0) && (
                  <p className="text-xs text-muted-foreground italic p-2 bg-muted/20 rounded-lg">
                    No explicit relationship links detected for this concept.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Supporting Evidence */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Grounded Course Evidence ({details?.evidence?.length ?? 0})
            </h4>

            {!details ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : details.evidence && details.evidence.length > 0 ? (
              <div className="space-y-3">
                {details.evidence.map((ev) => {
                  const isVisual = ev.evidenceType === "visual" || ev.evidenceType === "video_visual";
                  const isVideo = ev.evidenceType === "video_transcript" || ev.evidenceType === "video_visual";

                  return (
                    <div 
                      key={ev._id}
                      className="p-3.5 rounded-xl border bg-card/60 hover:bg-card transition-all space-y-2 shadow-2xs"
                    >
                      {/* Evidence Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-medium truncate">
                          {isVisual ? (
                            <ImageIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                          ) : isVideo ? (
                            <Video className="w-3.5 h-3.5 text-primary shrink-0" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                          )}
                          <span className="truncate text-foreground font-semibold">{ev.sourceName}</span>
                        </div>

                        {/* Location Badge */}
                        <div className="flex items-center gap-1 shrink-0">
                          {ev.pageNumber && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                              p.{ev.pageNumber}
                            </Badge>
                          )}
                          {ev.slideNumber && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                              Slide {formatSlideNumber(ev.slideNumber)}
                            </Badge>
                          )}
                          {ev.startTime !== undefined && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                              {formatTimestamp(ev.startTime)}
                            </Badge>
                          )}
                          {ev.visualType && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 uppercase tracking-wider text-primary border-primary/30">
                              {ev.visualType}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Visual Image Preview if present */}
                      {ev.imageUrl && (
                        <div className="w-full bg-black/90 rounded-lg overflow-hidden flex items-center justify-center p-2 border border-white/10 max-h-40">
                          <img 
                            src={ev.imageUrl} 
                            alt={concept.name}
                            className="max-h-36 w-auto max-w-full object-contain rounded"
                          />
                        </div>
                      )}

                      {/* Excerpt */}
                      <div className="text-xs leading-relaxed font-mono bg-muted/40 p-2.5 rounded-lg border text-muted-foreground whitespace-pre-wrap">
                        {ev.excerpt}
                      </div>

                      {/* Open in Source link */}
                      <div className="flex justify-end pt-1">
                        <Link 
                          href={`/dashboard/courses/${courseId}/sources/${ev.sourceId}`}
                          className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1"
                        >
                          View in Source <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No evidence items recorded.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
