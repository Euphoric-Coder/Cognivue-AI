"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, ShieldAlert } from "lucide-react";

export function EvaluationResultsTable({ cases = [], results = [], onInspect }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const casesById = useMemo(() => {
    const map = {};
    for (const c of cases) map[c.caseId] = c;
    return map;
  }, [cases]);

  const categories = useMemo(() => {
    const set = new Set(results.map((r) => r.category));
    return ["all", ...Array.from(set)];
  }, [results]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return results.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (statusFilter === "passed" && !r.passed) return false;
      if (statusFilter === "failed" && r.passed) return false;
      if (q) {
        const cText = JSON.stringify(casesById[r.caseId]?.input || "").toLowerCase();
        const rText = JSON.stringify(r.failureReasons || []).toLowerCase();
        if (!r.caseId.toLowerCase().includes(q) && !cText.includes(q) && !rText.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [results, casesById, categoryFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="filter-cat" className="sr-only">Filter by category</label>
          <select
            id="filter-cat"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === "all" ? "All Categories" : cat}
              </option>
            ))}
          </select>

          <label htmlFor="filter-status" className="sr-only">Filter by status</label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            <option value="all">All Statuses ({results.length})</option>
            <option value="failed">Failed Only ({results.filter((r) => !r.passed).length})</option>
            <option value="passed">Passed Only ({results.filter((r) => r.passed).length})</option>
          </select>
        </div>

        <Input
          placeholder="Search case ID or failure reason..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs h-9"
          aria-label="Search evaluation cases"
        />
      </div>

      {/* Responsive accessible scroll container with sticky header per modern web guidelines */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="eval-results-caption"
        className="relative max-h-[500px] overflow-auto rounded-lg border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-full border-collapse text-sm">
          <caption id="eval-results-caption" className="sr-only">
            Evaluation case results and automated diagnostic scores
          </caption>
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur border-b text-left">
            <tr>
              <th scope="col" className="p-3 font-semibold">Case ID</th>
              <th scope="col" className="p-3 font-semibold">Category</th>
              <th scope="col" className="p-3 font-semibold">Status</th>
              <th scope="col" className="p-3 font-semibold">Overall Score</th>
              <th scope="col" className="p-3 font-semibold">Latency</th>
              <th scope="col" className="p-3 font-semibold">Summary / Failure Notes</th>
              <th scope="col" className="p-3 font-semibold text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No evaluation results match the current filter.
                </td>
              </tr>
            ) : (
              filtered.map((res) => {
                const overall = res.scores?.overallScore;
                const matchedCase = casesById[res.caseId];
                return (
                  <tr key={res.caseId} className="hover:bg-muted/30 transition-colors">
                    <th scope="row" className="p-3 font-mono text-xs font-semibold text-left">
                      {res.caseId}
                    </th>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {res.category}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={res.passed ? "secondary" : "destructive"} className="text-xs">
                          {res.passed ? "PASS" : "FAIL"}
                        </Badge>
                        {res.criticalFailure && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <ShieldAlert className="h-3 w-3" /> Critical
                          </Badge>
                        )}
                        {res.humanOverride && (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-300">
                            Override
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {typeof overall === "number" ? `${Math.round(overall * 100)}%` : "—"}
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {Math.round(res.latencyMs || 0)} ms
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-md truncate">
                      {res.failureReasons?.length > 0
                        ? res.failureReasons[0]
                        : matchedCase?.input?.query || matchedCase?.metadata?.scenarioType || "Passed all checks"}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onInspect(matchedCase, res)}
                        className="gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Inspect
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

