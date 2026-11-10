"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Calendar, Clock, Sparkles, BookOpen, Target } from "lucide-react";

const TIME_OPTIONS = [15, 30, 45, 60, 90, 120];
const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function GeneratePlanDialog({ courseId, open, onOpenChange, onPlanGenerated }) {
  const generatePlan = useMutation(api.studyIntelligence.generateStudyPlan);

  const [planType, setPlanType] = useState("daily"); // "daily" | "weekly" | "exam_preparation"
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [preferredDays, setPreferredDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [targetDate, setTargetDate] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const toggleDay = (day) => {
    if (preferredDays.includes(day)) {
      if (preferredDays.length > 1) {
        setPreferredDays(preferredDays.filter((d) => d !== day));
      }
    } else {
      setPreferredDays([...preferredDays, day]);
    }
  };

  const handleGenerate = async () => {
    if (planType === "exam_preparation" && !targetDate) {
      toast.error("Please enter your target exam date.");
      return;
    }

    try {
      setIsGenerating(true);
      const todayDateStr = new Date().toISOString().split("T")[0];

      const res = await generatePlan({
        courseId,
        planType,
        dailyMinutes: Number(dailyMinutes),
        preferredStudyDays: preferredDays,
        targetDate: targetDate || undefined,
        todayDate: todayDateStr,
      });

      toast.success(
        `Generated ${res.title}! Scheduled ${res.itemsCount} tailored activity${res.itemsCount === 1 ? "" : "ies"}.`
      );

      onOpenChange(false);
      if (onPlanGenerated) onPlanGenerated(res);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to generate study plan.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-primary" />
            <DialogTitle>Generate Personal Study Plan</DialogTitle>
          </div>
          <DialogDescription>
            Tailored specifically from your concept mastery, prerequisite dependencies, active misconceptions, and spaced review schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Plan Type Selector */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Plan Focus
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPlanType("daily")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  planType === "daily"
                    ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <Clock className="w-4 h-4 mb-1.5 opacity-80" />
                <div className="text-xs font-medium">Daily Focus</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Today only</div>
              </button>

              <button
                type="button"
                onClick={() => setPlanType("weekly")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  planType === "weekly"
                    ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <BookOpen className="w-4 h-4 mb-1.5 opacity-80" />
                <div className="text-xs font-medium">Weekly Plan</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Next 7 days</div>
              </button>

              <button
                type="button"
                onClick={() => setPlanType("exam_preparation")}
                className={`p-3 rounded-xl border text-left transition-all ${
                  planType === "exam_preparation"
                    ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <Target className="w-4 h-4 mb-1.5 opacity-80" />
                <div className="text-xs font-medium">Exam Prep</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Up to exam</div>
              </button>
            </div>
          </div>

          {/* Daily Time Budget */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Daily Time Budget
            </Label>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDailyMinutes(mins)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    dailyMinutes === mins
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Study Days (for Weekly & Exam) */}
          {planType !== "daily" && (
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Preferred Study Days
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`w-9 h-9 rounded-lg text-xs font-medium border flex items-center justify-center transition-all ${
                      preferredDays.includes(day)
                        ? "bg-primary/15 border-primary text-primary font-semibold"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {day.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Target Exam Date */}
          {planType === "exam_preparation" && (
            <div>
              <Label htmlFor="exam-date" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Target Exam Date
              </Label>
              <Input
                id="exam-date"
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="text-sm"
              />
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Building Plan..." : "Generate Study Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

