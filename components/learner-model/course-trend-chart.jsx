"use client";

import React from "react";
import { TrendingUp, Clock, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function CourseTrendChart({ snapshots = [] }) {
  if (!snapshots || snapshots.length < 2) {
    return null;
  }

  // Width & height for responsive SVG chart
  const width = 600;
  const height = 140;
  const paddingX = 40;
  const paddingY = 25;

  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const points = snapshots.map((s, idx) => {
    const x = paddingX + (idx / (snapshots.length - 1)) * chartW;
    const masteryVal = Math.max(0, Math.min(100, s.overallMastery || 0));
    const y = height - paddingY - (masteryVal / 100) * chartH;
    return { x, y, mastery: masteryVal, coverage: s.coverage, date: s.timestamp, title: s.assessmentTitle };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const firstMastery = points[0].mastery;
  const lastMastery = points[points.length - 1].mastery;
  const overallDelta = lastMastery - firstMastery;

  return (
    <div className="p-5 rounded-2xl bg-card border shadow-xs space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold tracking-tight">Course Mastery Progression</h3>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{snapshots.length} graded milestones</span>
          <Badge
            variant="outline"
            className={
              overallDelta > 0
                ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10 font-bold"
                : overallDelta < 0
                ? "text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10 font-bold"
                : "text-muted-foreground"
            }
          >
            {overallDelta > 0 ? `+${overallDelta}%` : `${overallDelta}%`}
          </Badge>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32 overflow-visible">
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines at 25%, 50%, 75%, 100% */}
          {[0, 25, 50, 75, 100].map((level) => {
            const y = height - paddingY - (level / 100) * chartH;
            return (
              <g key={level} className="opacity-20">
                <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="currentColor" strokeDasharray="3 3" />
                <text x={paddingX - 8} y={y + 3} textAnchor="end" className="text-[9px] fill-muted-foreground font-mono">
                  {level}%
                </text>
              </g>
            );
          })}

          {/* Area fill under curve */}
          <polygon
            points={`${paddingX},${height - paddingY} ${polylinePoints} ${points[points.length - 1].x},${height - paddingY}`}
            fill="url(#trendGradient)"
          />

          {/* Polyline */}
          <polyline
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />

          {/* Data points */}
          {points.map((p, idx) => (
            <g key={idx} className="group cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r="4.5"
                className="fill-background stroke-primary stroke-[2.5] hover:r-6 transition-all"
              />
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                className="text-[10px] font-bold font-mono fill-foreground pointer-events-none"
              >
                {p.mastery}%
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-2 pt-1 border-t">
        <span>Initial attempt: {firstMastery}%</span>
        <span>Latest attempt: {lastMastery}%</span>
      </div>
    </div>
  );
}
