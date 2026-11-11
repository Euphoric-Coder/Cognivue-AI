"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Play, ShieldAlert, Cpu } from "lucide-react";

const RUN_TYPE_OPTIONS = [
  { value: "quick_suite", label: "Quick Suite (Balanced Regression Sample)" },
  { value: "full_suite", label: "Full Suite (All 9 Categories)" },
  { value: "rag", label: "RAG & Retrieval" },
  { value: "multimodal", label: "Multimodal & Visual RAG" },
  { value: "knowledge_graph", label: "Knowledge Graph" },
  { value: "assessment", label: "Assessment Generation & Validation" },
  { value: "grading", label: "Objective & Subjective Grading" },
  { value: "learner_model", label: "Learner Model Stability" },
  { value: "adaptive_tutor", label: "Adaptive Tutor Pedagogy" },
  { value: "study_intelligence", label: "Personal Study Intelligence" },
  { value: "security", label: "Security, Isolation & Injection Defense" },
];

export function RunEvaluationDialog({ open, onOpenChange, onLaunch, baselineRunId, isSubmitting }) {
  const [runType, setRunType] = useState("quick_suite");
  const [maxCases, setMaxCases] = useState("40");
  const [useLiveLlm, setUseLiveLlm] = useState(false);
  const [estimate, setEstimate] = useState(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const fetchEstimate = async () => {
      try {
        const parsedMax = parseInt(maxCases, 10);
        const res = await fetch("/api/evaluation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "estimate",
            runType,
            maxCases: Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null,
            useLiveLlm,
          }),
        });
        if (res.ok && active) {
          setEstimate(await res.json());
        }
      } catch {
        // Ignore offline estimate errors until launch
      }
    };
    fetchEstimate();
    return () => {
      active = false;
    };
  }, [open, runType, maxCases, useLiveLlm]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedMax = parseInt(maxCases, 10);
    onLaunch({
      runType,
      maxCases: Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null,
      useLiveLlm,
      baselineRunId: baselineRunId || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overscroll-contain max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            Run Isolated System Evaluation
          </DialogTitle>
          <DialogDescription>
            Runs on versioned benchmark fixtures in strict isolation. User courses, sources, mastery, and assessments are never altered.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="eval-run-type">Evaluation Suite / Category</Label>
            <select
              id="eval-run-type"
              value={runType}
              onChange={(e) => setRunType(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {RUN_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eval-max-cases">Max Cases Cap (Cost & Time Safeguard)</Label>
            <Input
              id="eval-max-cases"
              type="number"
              min={1}
              max={500}
              value={maxCases}
              onChange={(e) => setMaxCases(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-3 bg-muted/40">
            <input
              id="eval-live-llm"
              type="checkbox"
              checked={useLiveLlm}
              onChange={(e) => setUseLiveLlm(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300"
            />
            <div className="space-y-1 text-sm">
              <Label htmlFor="eval-live-llm" className="cursor-pointer font-medium">
                Enable Live Gemini LLM Judge (when GEMINI_API_KEY configured)
              </Label>
              <p className="text-xs text-muted-foreground">
                Leave unchecked for fast, zero-cost deterministic evaluation. Enabling invokes external Gemini judge calls per RAG/grading case.
              </p>
            </div>
          </div>

          {estimate && (
            <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                <span>Estimated Workload:</span>
                <Badge variant="secondary">{estimate.caseCount} cases</Badge>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span>{estimate.estimatedLlmCalls} LLM calls</span>
                <span>•</span>
                <span>~${estimate.estimatedCostUsd}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <Play className="h-4 w-4" />
              {isSubmitting ? "Running Evaluation..." : "Start Evaluation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

