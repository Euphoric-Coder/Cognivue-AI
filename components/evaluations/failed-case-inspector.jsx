"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

export function FailedCaseInspector({
  open,
  onOpenChange,
  evalCase,
  evalResult,
  courseId,
  onRecordOverride,
  canOverride,
}) {
  const [verdict, setVerdict] = useState("evaluator_incorrect");
  const [overriddenPassed, setOverriddenPassed] = useState(true);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!evalResult) return null;

  const isRealCourse = courseId && typeof courseId === "string" && !courseId.startsWith("eval_fixture_");

  const handleSaveOverride = async () => {
    if (!reason.trim() || !onRecordOverride) return;
    setSaving(true);
    try {
      await onRecordOverride({
        evaluationResultId: evalResult._id,
        verdict,
        overriddenPassed,
        reason: reason.trim(),
      });
      setReason("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl overscroll-contain max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-mono">{evalResult.caseId}</DialogTitle>
            <Badge variant="outline">{evalResult.category}</Badge>
            <Badge variant={evalResult.passed ? "secondary" : "destructive"}>
              {evalResult.passed ? "Automated: PASS" : "Automated: FAIL"}
            </Badge>
            {evalResult.criticalFailure && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert className="h-3 w-3" />
                CRITICAL BLOCKER
              </Badge>
            )}
            {evalResult.humanOverride && (
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">
                Human Review: {evalResult.humanOverride.verdict}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Inspect case input, expected criteria, retrieved evidence, system output, and evaluator metrics without mutating automated scores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {evalResult.failureReasons?.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              <div className="font-semibold text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Failure Reasons
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                {evalResult.failureReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 space-y-1.5 bg-muted/30">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case Input</div>
              <pre className="text-xs whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">
                {JSON.stringify(evalCase?.input ?? {}, null, 2)}
              </pre>
            </div>
            <div className="rounded-lg border p-3 space-y-1.5 bg-muted/30">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expected Behavior</div>
              <pre className="text-xs whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">
                {JSON.stringify(evalCase?.expectedBehavior ?? {}, null, 2)}
              </pre>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">System Output</div>
            <pre className="text-xs whitespace-pre-wrap break-words font-mono max-h-52 overflow-y-auto">
              {JSON.stringify(evalResult.systemOutput ?? {}, null, 2)}
            </pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Retrieved Evidence & Citations ({evalResult.retrievedEvidenceIds?.length || 0})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(evalResult.retrievedEvidenceIds || []).map((eid) => (
                  <Badge key={eid} variant="outline" className="font-mono text-xs">
                    {eid}
                  </Badge>
                ))}
                {(!evalResult.retrievedEvidenceIds || evalResult.retrievedEvidenceIds.length === 0) && (
                  <span className="text-xs text-muted-foreground">No evidence chunks retrieved.</span>
                )}
              </div>
              {isRealCourse && (
                <div className="pt-2">
                  <Link
                    href={`/dashboard/courses/${courseId}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Open Source Course <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metric Scores & Latency</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(evalResult.scores || {}).map(([k, v]) => (
                  <Badge key={k} variant="secondary" className="font-mono text-xs">
                    {k}: {typeof v === "number" ? v.toFixed(2) : String(v)}
                  </Badge>
                ))}
                <Badge variant="outline" className="font-mono text-xs">
                  {Math.round(evalResult.latencyMs || 0)} ms
                </Badge>
              </div>
            </div>
          </div>

          {evalResult.humanOverride && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
                Recorded Human Override (Original Automated Verdict Preserved)
              </div>
              <p>
                <strong>Verdict:</strong> {evalResult.humanOverride.verdict} ({evalResult.humanOverride.overriddenPassed ? "Mark Passed" : "Confirm Fail"})
              </p>
              <p>
                <strong>Reason:</strong> {evalResult.humanOverride.reason}
              </p>
            </div>
          )}

          {canOverride && evalResult._id && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Human Review / Override Automated Judgment
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="override-verdict" className="text-xs">Reviewer Assessment</Label>
                  <select
                    id="override-verdict"
                    value={verdict}
                    onChange={(e) => {
                      const val = e.target.value;
                      setVerdict(val);
                      setOverriddenPassed(val === "evaluator_incorrect");
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-xs"
                  >
                    <option value="evaluator_incorrect">Evaluator Incorrect (Should Pass)</option>
                    <option value="confirmed_failure">Confirmed Genuine System Failure</option>
                    <option value="needs_investigation">Needs Investigation</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="override-reason" className="text-xs">Justification (Required)</Label>
                  <Textarea
                    id="override-reason"
                    rows={2}
                    placeholder="Explain why the evaluator judgment was inaccurate or confirmed..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveOverride} disabled={!reason.trim() || saving}>
                  {saving ? "Saving Review..." : "Save Human Review"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close Inspector
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

