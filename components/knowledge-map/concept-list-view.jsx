"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, ArrowRight, BookOpen, Layers, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export function ConceptListView({ concepts, relationships, onSelectConcept, courseId }) {
  const router = useRouter();

  if (!concepts || concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border rounded-2xl bg-muted/10 border-dashed">
        <BookOpen className="w-10 h-10 text-muted-foreground/50 mb-3" />
        <h3 className="font-semibold text-base mb-1">No concepts matching filter</h3>
        <p className="text-sm text-muted-foreground">Try adjusting your search query or filter settings.</p>
      </div>
    );
  }

  // Count incoming and outgoing relationships for each concept
  const relCountMap = {};
  for (const r of (relationships || [])) {
    relCountMap[r.fromConceptId] = (relCountMap[r.fromConceptId] || 0) + 1;
    relCountMap[r.toConceptId] = (relCountMap[r.toConceptId] || 0) + 1;
  }

  const coreConcepts = concepts.filter((c) => c.importance === "core");
  const supportingConcepts = concepts.filter((c) => c.importance === "supporting");
  const minorConcepts = concepts.filter((c) => c.importance === "minor");

  const renderConceptCard = (concept) => {
    const isCore = concept.importance === "core";
    const totalRels = relCountMap[concept._id] || 0;

    const handleAsk = (e) => {
      e.stopPropagation();
      const q = `Explain ${concept.name} using my course materials.`;
      router.push(`/dashboard/courses/${courseId}/tutor?initialQuestion=${encodeURIComponent(q)}`);
    };

    return (
      <Card 
        key={concept._id}
        className={`group cursor-pointer hover:shadow-md transition-all border ${
          isCore ? "hover:border-primary/50 bg-gradient-to-b from-primary/5 to-transparent" : "hover:border-foreground/20"
        }`}
        onClick={() => onSelectConcept(concept)}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <Badge 
              variant={isCore ? "default" : "secondary"}
              className={`text-[10px] uppercase tracking-wider font-semibold ${
                isCore ? "bg-primary text-primary-foreground shadow-2xs" : ""
              }`}
            >
              {concept.importance}
            </Badge>

            <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              {concept.type}
            </Badge>

            <span className="text-[11px] text-muted-foreground ml-auto">
              {concept.sourceCount || 1} {concept.sourceCount === 1 ? "source" : "sources"}
            </span>
          </div>

          <CardTitle className="text-base font-bold group-hover:text-primary transition-colors line-clamp-1">
            {concept.name}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 pt-1 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {concept.description}
          </p>

          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-primary" />
                {concept.evidenceCount} evidence
              </span>
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {totalRels} links
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                onClick={handleAsk}
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                Tutor
              </Button>

              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs px-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all"
              >
                Inspect
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8 pb-12">
      {coreConcepts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Core Concepts ({coreConcepts.length})
            </h3>
            <span className="text-xs text-muted-foreground">Foundational course knowledge</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coreConcepts.map(renderConceptCard)}
          </div>
        </div>
      )}

      {supportingConcepts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              Supporting Concepts ({supportingConcepts.length})
            </h3>
            <span className="text-xs text-muted-foreground">Methods, applications, and extensions</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supportingConcepts.map(renderConceptCard)}
          </div>
        </div>
      )}

      {minorConcepts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              Specialized Topics ({minorConcepts.length})
            </h3>
            <span className="text-xs text-muted-foreground">Definitions and minor topics</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {minorConcepts.map(renderConceptCard)}
          </div>
        </div>
      )}
    </div>
  );
}
