"use client";

import { use, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  Network, 
  Search, 
  Sparkles, 
  RefreshCw, 
  AlertTriangle, 
  Layers, 
  ListFilter,
  LayoutGrid,
  GitFork,
  BookOpen,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Target
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { InteractiveGraph } from "@/components/knowledge-map/interactive-graph";
import { ConceptListView } from "@/components/knowledge-map/concept-list-view";
import { ConceptDetailsSheet } from "@/components/knowledge-map/concept-details-sheet";
import { EdgeDetailsDialog } from "@/components/knowledge-map/edge-details-dialog";

export default function KnowledgeMapPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;

  const graphData = useQuery(api.knowledgeGraph.getCourseKnowledgeGraph, { courseId });
  const sources = useQuery(api.sources.getCourseSources, { courseId });
  const conceptStates = useQuery(api.learnerModel.getCourseConceptStates, { courseId });

  const [viewMode, setViewMode] = useState("graph"); // "graph" | "list"
  const [displayMode, setDisplayMode] = useState("structure"); // "structure" | "mastery"
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");
  const [isBuilding, setIsBuilding] = useState(false);

  const [selectedConcept, setSelectedConcept] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);

  const learnerStatesMap = useMemo(() => {
    if (!conceptStates) return new Map();
    const map = new Map();
    for (const s of conceptStates) {
      map.set(s.conceptId, s);
    }
    return map;
  }, [conceptStates]);

  // Filtered concepts based on search and type filter
  const allConcepts = graphData?.concepts || [];
  const allRelationships = graphData?.relationships || [];

  const filteredConcepts = allConcepts.filter((c) => {
    // Search filter
    const matchesSearch =
      !searchQuery.trim() ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.aliases && c.aliases.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase())));

    if (!matchesSearch) return false;

    // Category filter
    if (selectedTypeFilter === "all") return true;
    if (selectedTypeFilter === "core") return c.importance === "core";
    if (selectedTypeFilter === "prereq") {
      return allRelationships.some(
        (r) =>
          (r.fromConceptId === c._id || r.toConceptId === c._id) &&
          (r.relationType === "PREREQUISITE_OF" || r.relationType === "DEPENDS_ON")
      );
    }
    return c.type === selectedTypeFilter;
  });

  // Filtered relationships connecting filtered concepts
  const validIds = new Set(filteredConcepts.map((c) => c._id));
  const filteredRelationships = allRelationships.filter(
    (r) => validIds.has(r.fromConceptId) && validIds.has(r.toConceptId)
  );

  const handleBuildGraph = async (forceRebuild = false) => {
    setIsBuilding(true);
    toast.info(forceRebuild ? "Rebuilding Knowledge Graph..." : "Starting Knowledge Graph extraction...");

    try {
      const res = await fetch("/api/knowledge-graph/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          forceRebuild,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Build request failed");
      }

      toast.success("Knowledge Graph build started! It will update automatically once ready.");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to trigger Knowledge Graph build");
    } finally {
      setIsBuilding(false);
    }
  };

  if (graphData === undefined || sources === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading knowledge map...</p>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Connecting to course...</p>
      </div>
    );
  }

  const status = graphData?.status || "not_started";
  const readySources = (sources || []).filter((s) => s.status === "ready");

  // State 1: Building State
  if (status === "building" || isBuilding) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] border rounded-2xl bg-card border-dashed p-8 relative overflow-hidden">
        <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 animate-pulse">
          <Network className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: "8s" }} />
        </div>

        <h3 className="text-xl font-bold tracking-tight mb-2">Constructing Knowledge Graph</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
          Cognivue is analyzing your course materials, extracting grounded educational concepts, and linking prerequisite relationships.
        </p>

        <div className="space-y-3 w-full max-w-sm">
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Scanning grounded course evidence</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border text-xs">
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
            <span>Extracting core concepts & methods</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-dashed text-xs text-muted-foreground">
            <span className="w-4 h-4 rounded-full border border-muted-foreground/40 shrink-0" />
            <span>Validating relationship hierarchy</span>
          </div>
        </div>
      </div>
    );
  }

  // State 2: Not Started / Empty State
  if (status === "not_started" && (!graphData.concepts || graphData.concepts.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] border rounded-2xl bg-card border-dashed p-8 relative overflow-hidden">
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

        <div className="relative z-10 flex flex-col items-center text-center p-8 bg-background/80 backdrop-blur-sm rounded-2xl border max-w-lg shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Network className="w-7 h-7 text-primary" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight mb-2">Build Your Course Knowledge Map</h2>

          <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
            Cognivue will automatically identify key concepts, connect related ideas, and trace every concept and prerequisite relationship back to your uploaded course material.
          </p>

          <Button 
            size="lg"
            className="flex items-center gap-2 font-semibold shadow-sm"
            onClick={() => handleBuildGraph(false)}
            disabled={readySources.length === 0}
          >
            <Sparkles className="w-4 h-4" />
            Build Knowledge Graph
          </Button>

          {readySources.length === 0 && (
            <p className="text-xs text-amber-500 mt-3">
              Upload at least one course source to generate the knowledge map.
            </p>
          )}
        </div>
      </div>
    );
  }

  // State 3: Ready or Outdated Graph View
  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] space-y-4">
      {/* Outdated Warning Banner */}
      {status === "outdated" && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>New course material available:</strong> The knowledge graph is outdated and can be rebuilt to reflect recent source updates.
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-500/40 hover:bg-amber-500/20 text-foreground"
            onClick={() => handleBuildGraph(true)}
            disabled={isBuilding}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isBuilding ? "animate-spin" : ""}`} />
            Rebuild Graph
          </Button>
        </div>
      )}

      {/* Failure Banner */}
      {status === "failed" && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between text-xs text-rose-600 dark:text-rose-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Knowledge graph build failed:</strong> {graphData.error || "An error occurred during extraction."}
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-rose-500/40 hover:bg-rose-500/20 text-foreground"
            onClick={() => handleBuildGraph(true)}
            disabled={isBuilding}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry Build
          </Button>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card p-3 rounded-2xl border shadow-2xs">
        {/* Left: Search & Filter Pills */}
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search concepts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl bg-muted/40 border-transparent focus-visible:ring-1"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: "all", label: "All" },
              { id: "core", label: "Core" },
              { id: "prereq", label: "Prerequisites" },
              { id: "method", label: "Methods" },
              { id: "definition", label: "Definitions" },
              { id: "formula", label: "Formulas" },
              { id: "system", label: "Systems" },
            ].map((f) => (
              <Button
                key={f.id}
                variant={selectedTypeFilter === f.id ? "secondary" : "ghost"}
                size="sm"
                className={`h-7 px-2.5 text-xs rounded-lg ${
                  selectedTypeFilter === f.id ? "font-bold text-primary" : "text-muted-foreground"
                }`}
                onClick={() => setSelectedTypeFilter(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Right: Metrics & Controls */}
        <div className="flex items-center gap-2 justify-end">
          <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground mr-2">
            <span><strong>{graphData.conceptCount}</strong> concepts</span>
            <span>•</span>
            <span><strong>{graphData.relationshipCount}</strong> links</span>
          </div>

          {/* Display Mode Toggle: Structure vs Mastery (V8) */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-xl border">
            <Button
              variant={displayMode === "structure" ? "secondary" : "ghost"}
              size="sm"
              className={`h-7 text-xs px-2.5 rounded-lg font-medium ${
                displayMode === "structure" ? "font-bold text-primary" : "text-muted-foreground"
              }`}
              onClick={() => setDisplayMode("structure")}
            >
              Structure
            </Button>
            <Button
              variant={displayMode === "mastery" ? "secondary" : "ghost"}
              size="sm"
              className={`h-7 text-xs px-2.5 rounded-lg font-medium ${
                displayMode === "mastery" ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              }`}
              onClick={() => setDisplayMode("mastery")}
            >
              <Target className="w-3.5 h-3.5 mr-1" />
              Mastery
            </Button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-xl border">
            <Button
              variant={viewMode === "graph" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5 rounded-lg font-medium"
              onClick={() => setViewMode("graph")}
            >
              <GitFork className="w-3.5 h-3.5 mr-1" />
              Graph
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5 rounded-lg font-medium"
              onClick={() => setViewMode("list")}
            >
              <LayoutGrid className="w-3.5 h-3.5 mr-1" />
              List
            </Button>
          </div>

          {/* Rebuild Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2.5 rounded-xl"
            onClick={() => handleBuildGraph(true)}
            disabled={isBuilding}
            title="Rebuild Knowledge Graph"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isBuilding ? "animate-spin" : ""}`} />
            Rebuild
          </Button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 min-h-0 relative">
        {viewMode === "graph" ? (
          <InteractiveGraph
            concepts={filteredConcepts}
            relationships={filteredRelationships}
            onSelectConcept={(c) => setSelectedConcept(c)}
            onSelectEdge={(e) => setSelectedEdge(e)}
            selectedConceptId={selectedConcept?._id}
            displayMode={displayMode}
            learnerStatesMap={learnerStatesMap}
          />
        ) : (
          <div className="h-full overflow-y-auto pr-1">
            <ConceptListView
              concepts={filteredConcepts}
              relationships={graphData.relationships}
              onSelectConcept={(c) => setSelectedConcept(c)}
              courseId={courseId}
            />
          </div>
        )}
      </div>

      {/* Node Details Slide-over Panel */}
      <ConceptDetailsSheet
        concept={selectedConcept}
        courseId={courseId}
        onClose={() => setSelectedConcept(null)}
        onSelectConcept={(conceptId) => {
          const target = graphData.concepts.find((c) => c._id === conceptId);
          if (target) setSelectedConcept(target);
        }}
      />

      {/* Edge Details Modal */}
      <EdgeDetailsDialog
        edge={selectedEdge}
        courseId={courseId}
        onClose={() => setSelectedEdge(null)}
      />
    </div>
  );
}
