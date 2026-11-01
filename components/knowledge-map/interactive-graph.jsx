"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Move, 
  Sparkles,
  ArrowRight,
  Maximize2
} from "lucide-react";

export function InteractiveGraph({
  concepts,
  relationships,
  onSelectConcept,
  onSelectEdge,
  selectedConceptId,
  displayMode = "structure",
  learnerStatesMap = new Map(),
}) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });
  
  // Transform state: pan & zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Dragging node state
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // Measure container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 900,
          height: containerRef.current.clientHeight || 600,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Compute node positions with pure layout calculation
  const [draggedPositions, setDraggedPositions] = useState({});

  const initialPositions = useMemo(() => {
    if (!concepts || concepts.length === 0) return {};

    const w = dimensions.width;
    const h = dimensions.height;
    const cx = w / 2;
    const cy = h / 2;

    const newPositions = {};
    const n = concepts.length;

    // Sort concepts so core ones are centered
    const coreList = concepts.filter(c => c.importance === "core");
    const othersList = concepts.filter(c => c.importance !== "core");
    const ordered = [...coreList, ...othersList];

    ordered.forEach((c, idx) => {
      if (c.importance === "core") {
        // Inner circle / core ring
        const radius = Math.min(w, h) * 0.22;
        const angle = (idx / Math.max(coreList.length, 1)) * 2 * Math.PI - Math.PI / 2;
        newPositions[c._id] = {
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle),
        };
      } else {
        // Outer ring
        const outIdx = idx - coreList.length;
        const radius = Math.min(w, h) * 0.40;
        const angle = (outIdx / Math.max(othersList.length, 1)) * 2 * Math.PI - Math.PI / 2;
        newPositions[c._id] = {
          x: cx + radius * Math.cos(angle) + (Math.sin(outIdx * 3) * 20),
          y: cy + radius * Math.sin(angle) + (Math.cos(outIdx * 3) * 20),
        };
      }
    });

    // Run simple spring relaxation (15 iterations)
    for (let iter = 0; iter < 15; iter++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const idA = concepts[i]._id;
          const idB = concepts[j]._id;
          const pA = newPositions[idA];
          const pB = newPositions[idB];
          if (!pA || !pB) continue;

          const dx = pB.x - pA.x;
          const dy = pB.y - pA.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = 140;

          if (dist < minDist) {
            const force = ((minDist - dist) / dist) * 0.15;
            pA.x -= dx * force;
            pA.y -= dy * force;
            pB.x += dx * force;
            pB.y += dy * force;
          }
        }
      }

      for (const rel of relationships || []) {
        const pFrom = newPositions[rel.fromConceptId];
        const pTo = newPositions[rel.toConceptId];
        if (!pFrom || !pTo) continue;

        const dx = pTo.x - pFrom.x;
        const dy = pTo.y - pFrom.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 180;

        if (dist > targetDist) {
          const force = ((dist - targetDist) / dist) * 0.05;
          pFrom.x += dx * force;
          pFrom.y += dy * force;
          pTo.x -= dx * force;
          pTo.y -= dy * force;
        }
      }
    }

    return newPositions;
  }, [concepts, relationships, dimensions]);

  const nodePositions = useMemo(() => {
    return { ...initialPositions, ...draggedPositions };
  }, [initialPositions, draggedPositions]);

  // Concept lookup map
  const conceptMap = useMemo(() => {
    const map = {};
    for (const c of concepts) {
      map[c._id] = c;
    }
    return map;
  }, [concepts]);

  // Connected neighbors for hover highlight
  const connectedMap = useMemo(() => {
    if (!hoveredNodeId) return null;
    const connected = new Set([hoveredNodeId]);
    for (const r of relationships || []) {
      if (r.fromConceptId === hoveredNodeId) connected.add(r.toConceptId);
      if (r.toConceptId === hoveredNodeId) connected.add(r.fromConceptId);
    }
    return connected;
  }, [hoveredNodeId, relationships]);

  // Pan handlers
  const handleMouseDown = (e) => {
    if (e.target.closest(".graph-node") || e.target.closest(".graph-edge-chip")) {
      return;
    }
    setIsPanning(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (draggingNodeId) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;

      setDraggedPositions((prev) => ({
        ...prev,
        [draggingNodeId]: { x: mouseX, y: mouseY }
      }));
    } else if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((z) => Math.min(Math.max(z * factor, 0.4), 2.2));
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setDraggedPositions({});
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full min-h-[560px] bg-card rounded-2xl border overflow-hidden select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
    >
      {/* Background Grid Pattern */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-10"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          transform: `translate(${pan.x % 24}px, ${pan.y % 24}px)`,
        }}
      />

      {/* SVG Canvas for Edges & Nodes */}
      <svg className="w-full h-full absolute inset-0">
        <defs>
          {/* Arrowhead marker - default */}
          <marker
            id="arrow-default"
            viewBox="0 0 10 10"
            refX="24"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="currentColor" className="text-muted-foreground/60" />
          </marker>

          {/* Arrowhead marker - prerequisite (amber) */}
          <marker
            id="arrow-prereq"
            viewBox="0 0 10 10"
            refX="24"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
          </marker>

          {/* Arrowhead marker - active/selected */}
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="24"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="currentColor" className="text-primary" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Render Relationships (Edges) */}
          {(relationships || []).map((rel) => {
            const pFrom = nodePositions[rel.fromConceptId];
            const pTo = nodePositions[rel.toConceptId];
            if (!pFrom || !pTo) return null;

            const isPrereq = rel.relationType === "PREREQUISITE_OF" || rel.relationType === "DEPENDS_ON";
            const isHighlighted = 
              hoveredNodeId === rel.fromConceptId || 
              hoveredNodeId === rel.toConceptId ||
              selectedConceptId === rel.fromConceptId ||
              selectedConceptId === rel.toConceptId;

            const isDimmed = hoveredNodeId && !isHighlighted;

            // Curve calculation
            const dx = pTo.x - pFrom.x;
            const dy = pTo.y - pFrom.y;
            const midX = (pFrom.x + pTo.x) / 2;
            const midY = (pFrom.y + pTo.y) / 2;

            // Perpendicular offset for subtle curve
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const curvature = 18;
            const ctrlX = midX - (dy / dist) * curvature;
            const ctrlY = midY + (dx / dist) * curvature;

            const markerId = isHighlighted ? "url(#arrow-active)" : isPrereq ? "url(#arrow-prereq)" : "url(#arrow-default)";

            return (
              <g 
                key={rel._id} 
                className={`transition-opacity duration-200 ${isDimmed ? "opacity-15" : "opacity-90"}`}
              >
                {/* Clickable hover line */}
                <path
                  d={`M ${pFrom.x} ${pFrom.y} Q ${ctrlX} ${ctrlY} ${pTo.x} ${pTo.y}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                  className="cursor-pointer"
                  onClick={() => onSelectEdge && onSelectEdge(rel)}
                />

                {/* Visible Edge */}
                <path
                  d={`M ${pFrom.x} ${pFrom.y} Q ${ctrlX} ${ctrlY} ${pTo.x} ${pTo.y}`}
                  fill="none"
                  stroke={isHighlighted ? "currentColor" : isPrereq ? "#d97706" : "currentColor"}
                  strokeWidth={isHighlighted ? "2.5" : isPrereq ? "2" : "1.5"}
                  strokeDasharray={rel.relationType === "RELATED_TO" ? "4 3" : undefined}
                  className={`transition-colors pointer-events-none ${
                    isHighlighted ? "text-primary" : isPrereq ? "" : "text-muted-foreground/40"
                  }`}
                  markerEnd={markerId}
                />

                {/* Relationship Chip at midpoint */}
                <g 
                  transform={`translate(${ctrlX}, ${ctrlY})`}
                  className="graph-edge-chip cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEdge && onSelectEdge(rel);
                  }}
                >
                  <rect
                    x="-42"
                    y="-9"
                    width="84"
                    height="18"
                    rx="9"
                    className={`transition-all ${
                      isPrereq 
                        ? "fill-amber-500/20 stroke-amber-500/60" 
                        : isHighlighted
                        ? "fill-primary/20 stroke-primary"
                        : "fill-card stroke-border"
                    } stroke-[1] hover:stroke-primary hover:scale-105`}
                  />
                  <text
                    textAnchor="middle"
                    y="3.5"
                    className={`text-[9px] font-semibold tracking-wider uppercase pointer-events-none ${
                      isPrereq ? "fill-amber-600 dark:fill-amber-400" : isHighlighted ? "fill-primary font-bold" : "fill-muted-foreground"
                    }`}
                  >
                    {rel.relationType.replace(/_/g, " ").slice(0, 14)}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Render Concepts (Nodes) */}
          {concepts.map((concept) => {
            const pos = nodePositions[concept._id];
            if (!pos) return null;

            const isSelected = selectedConceptId === concept._id;
            const isHovered = hoveredNodeId === concept._id;
            const isConnected = connectedMap ? connectedMap.has(concept._id) : true;
            const isCore = concept.importance === "core";

            // Learner state integration (V8 Knowledge Map Mastery Mode)
            const lState = learnerStatesMap?.get(concept._id);
            const hasEvidence = lState && lState.evidenceCount > 0 && lState.masteryBand !== "insufficient_evidence";
            const masteryPct = hasEvidence ? Math.round(lState.masteryProbability * 100) : null;
            const band = lState ? lState.masteryBand : "not_assessed";

            let nodeStrokeClass = "";
            let topBadgeText = concept.type;
            let indicatorFill = null;

            if (displayMode === "mastery") {
              if (band === "strong") {
                nodeStrokeClass = "stroke-emerald-500 stroke-[2.2] dark:stroke-emerald-400";
                topBadgeText = `${masteryPct}% · Strong`;
                indicatorFill = "fill-emerald-500";
              } else if (band === "proficient") {
                nodeStrokeClass = "stroke-blue-500 stroke-[2] dark:stroke-blue-400";
                topBadgeText = `${masteryPct}% · Proficient`;
                indicatorFill = "fill-blue-500";
              } else if (band === "developing") {
                nodeStrokeClass = "stroke-amber-500 stroke-[2] dark:stroke-amber-400";
                topBadgeText = `${masteryPct}% · Developing`;
                indicatorFill = "fill-amber-500";
              } else if (band === "needs_attention") {
                nodeStrokeClass = "stroke-rose-500 stroke-[2.2] dark:stroke-rose-400";
                topBadgeText = `${masteryPct}% · Needs Attention`;
                indicatorFill = "fill-rose-500";
              } else {
                nodeStrokeClass = "stroke-muted-foreground/40 stroke-dashed stroke-[1.2]";
                topBadgeText = "— · Not Assessed";
                indicatorFill = "fill-muted-foreground/40";
              }
            } else {
              nodeStrokeClass = isCore
                ? "stroke-primary/70 stroke-[1.8] shadow-sm"
                : "stroke-border stroke-[1.2] shadow-2xs";
              indicatorFill = isCore ? "fill-primary animate-pulse" : null;
            }

            const width = Math.max(160, Math.min(concept.name.length * 8.5 + 50, 240));
            const height = 54;

            return (
              <g
                key={concept._id}
                transform={`translate(${pos.x - width / 2}, ${pos.y - height / 2})`}
                className={`graph-node cursor-pointer transition-opacity duration-200 ${
                  !isConnected ? "opacity-25" : "opacity-100"
                }`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggingNodeId(concept._id);
                }}
                onMouseEnter={() => setHoveredNodeId(concept._id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectConcept(concept);
                }}
              >
                {/* Node Box */}
                <rect
                  width={width}
                  height={height}
                  rx="14"
                  className={`transition-all duration-150 fill-card ${
                    isSelected
                      ? "stroke-primary stroke-[2.5] shadow-lg"
                      : nodeStrokeClass
                  } hover:stroke-primary hover:shadow-md`}
                />

                {/* Indicator dot */}
                {indicatorFill && (
                  <circle
                    cx={14}
                    cy={16}
                    r={3.5}
                    className={indicatorFill}
                  />
                )}

                {/* Concept Type / Mastery Badge text (Accessible: includes textual mastery label) */}
                <text
                  x={indicatorFill ? 24 : 14}
                  y={19}
                  className="text-[9.5px] uppercase font-bold tracking-wider fill-muted-foreground pointer-events-none"
                >
                  {topBadgeText}
                </text>

                {/* Concept Name */}
                <text
                  x={14}
                  y={39}
                  className={`text-xs font-bold pointer-events-none truncate ${
                    isSelected || isHovered ? "fill-primary" : "fill-foreground"
                  }`}
                  style={{ maxWidth: width - 28 }}
                >
                  {concept.name.length > 24 ? concept.name.slice(0, 22) + "..." : concept.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Canvas Controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 p-1.5 bg-background/90 backdrop-blur-md rounded-xl border shadow-sm z-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => setZoom((z) => Math.min(z * 1.2, 2.2))}
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => setZoom((z) => Math.max(z * 0.8, 0.4))}
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={resetView}
          title="Reset Zoom & Pan"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Legend at Top-Left */}
      <div className="absolute top-4 left-4 p-2.5 bg-background/80 backdrop-blur-md rounded-xl border shadow-2xs z-10 space-y-1 text-[11px] text-muted-foreground hidden sm:block">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>Core Concept</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-amber-500 rounded" />
          <span>Prerequisite / Dependency</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-muted-foreground/60 rounded" />
          <span>Related / Part Of</span>
        </div>
      </div>
    </div>
  );
}
