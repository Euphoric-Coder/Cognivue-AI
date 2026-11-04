"use client";

import { use, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare,
  Plus,
  Send,
  FileText,
  Loader2,
  Search,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  AlertCircle,
  Lightbulb,
  Compass,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { formatSlideNumber, formatTimestamp } from "@/lib/utils";

const TUTOR_MODES = [
  { id: "adaptive", label: "Adaptive", desc: "Adapts pedagogy automatically from learner mastery" },
  { id: "explain", label: "Explain", desc: "Direct, comprehensive grounded explanation" },
  { id: "socratic", label: "Socratic", desc: "Guided questions to reason through solutions step by step" },
  { id: "hint", label: "Hint", desc: "Graduated progressive hints without revealing the full answer" },
  { id: "quick_review", label: "Quick Review", desc: "Concise summary and key definitions" },
  { id: "deep_dive", label: "Deep Dive", desc: "Exhaustive multi-source evidence and connections" },
];

export default function TutorPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;

  const sources = useQuery(api.sources.getCourseSources, { courseId });
  const sessions = useQuery(api.tutor.getSessions, { courseId });
  const createSession = useMutation(api.tutor.createSession);

  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const activeSessionId = selectedSessionId || (sessions && sessions.length > 0 ? sessions[0]._id : null);

  if (sources === undefined) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ragReadySources = sources.filter((s) => s.ragStatus === "ready");
  const hasRagReady = ragReadySources.length > 0;

  if (!hasRagReady) {
    return (
      <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto">
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border rounded-2xl bg-card border-dashed mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-3">AI Tutor Unavailable</h2>
          <p className="text-muted-foreground max-w-md mb-8">
            Upload and process at least one supported course source before asking source-grounded questions.
          </p>
          <div className="bg-muted/50 p-4 rounded-lg mb-8 max-w-sm text-sm">
            {sources.length > 0
              ? sources.some((s) => s.ragStatus === "embedding" || s.ragStatus === "pending")
                ? "Preparing your course for AI search..."
                : "No sources are ready for AI Search yet. Check the sources tab."
              : "Your course has no learning materials yet."}
          </div>
          <Link href={`/dashboard/courses/${courseId}/sources`}>
            <Button variant="default">Go to Sources</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] -mt-4">
      {/* Sidebar - Chat History */}
      <div className="w-64 border-r pr-4 hidden md:flex flex-col">
        <Button
          variant="outline"
          className="w-full justify-start mb-6"
          onClick={async () => {
            const newSessionId = await createSession({ courseId });
            setSelectedSessionId(newSessionId);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
        <div className="flex-1 overflow-y-auto space-y-1 pr-2">
          <h4 className="text-xs font-semibold text-muted-foreground mb-3 px-2">RECENT CHATS</h4>
          {sessions === undefined ? (
            <Skeleton className="h-8 w-full" />
          ) : sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2">No history</p>
          ) : (
            sessions.map((s) => (
              <Button
                key={s._id}
                variant={activeSessionId === s._id ? "secondary" : "ghost"}
                className="w-full justify-start font-normal text-sm px-2 truncate h-9"
                onClick={() => setSelectedSessionId(s._id)}
              >
                <MessageSquare className="mr-2 h-3.5 w-3.5 opacity-50 shrink-0" />
                <span className="truncate">{s.title || "New Chat"}</span>
              </Button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col pl-0 md:pl-6 max-w-4xl mx-auto w-full relative">
        {activeSessionId ? (
          <ChatArea courseId={courseId} sessionId={activeSessionId} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Button
              onClick={async () => {
                const newSessionId = await createSession({ courseId });
                setSelectedSessionId(newSessionId);
              }}
            >
              Start Chatting
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatArea({ courseId, sessionId }) {
  const searchParams = useSearchParams();
  const initialQ = searchParams?.get("initialQuestion");
  const reviewQuestionId = searchParams?.get("reviewQuestionId");
  const reviewResponseId = searchParams?.get("reviewResponseId");
  const focusConceptId = searchParams?.get("focusConceptId");

  const session = useQuery(api.tutor.getSession, { sessionId });
  const messages = useQuery(api.tutor.getMessages, { sessionId });
  const updateSessionMode = useMutation(api.tutor.updateSessionMode);

  const [modeOverride, setModeOverride] = useState(null);
  const tutorMode = modeOverride ?? session?.tutorMode ?? "adaptive";

  const [hintLevelOverride, setHintLevelOverride] = useState(null);
  const activeHintLevel = hintLevelOverride ?? session?.activeHintLevel ?? 1;

  const [input, setInput] = useState(() => {
    if (reviewQuestionId) {
      return "Help me understand why my answer to this assessment question was incorrect.";
    }
    return initialQ || "";
  });
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleModeChange = async (newMode) => {
    setModeOverride(newMode);
    try {
      await updateSessionMode({
        sessionId,
        tutorMode: newMode,
      });
      toast.success(`Tutor mode switched to ${newMode.replace(/_/g, " ")}`);
    } catch (e) {
      console.warn("Failed to persist session mode:", e);
    }
  };

  const handleSendPrompt = async (promptText) => {
    if (!promptText || loading) return;
    setInput("");
    setLoading(true);
    setLoadingState("Searching your course & adapting pedagogy...");

    try {
      await new Promise((r) => setTimeout(r, 400));
      setLoadingState("Building grounded response...");

      const res = await fetch("/api/tutor/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          sessionId,
          question: promptText,
          tutorMode,
          activeHintLevel,
          focusConceptId,
          reviewQuestionId,
          reviewResponseId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }
    } catch (error) {
      console.error(error);
      toast.error("An error occurred while talking to the tutor.");
    } finally {
      setLoading(false);
      setLoadingState("");
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    handleSendPrompt(input.trim());
  };

  // Find latest active concept if present
  const latestAssistantMessage = messages ? [...messages].reverse().find((m) => m.role === "assistant") : null;
  const currentConcept = latestAssistantMessage?.adaptation?.conceptName || null;

  return (
    <>
      {/* V9 Tutor Header / Mode Bar (Requirement #22, #52) */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b bg-background/50 backdrop-blur-xs flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode:</span>
          <select
            value={tutorMode}
            onChange={(e) => handleModeChange(e.target.value)}
            className="text-xs font-medium bg-muted/60 border rounded-lg px-2.5 py-1 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer transition-colors hover:bg-muted"
          >
            {TUTOR_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            · {TUTOR_MODES.find((m) => m.id === tutorMode)?.desc}
          </span>
        </div>

        {currentConcept && (
          <Badge variant="outline" className="text-xs font-medium gap-1 text-muted-foreground py-0.5">
            Focus: <span className="text-foreground font-semibold">{currentConcept}</span>
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        {messages === undefined ? (
          <div className="flex justify-center mt-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-60 space-y-3 py-16">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-base text-foreground">Cognivue Adaptive Tutor</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Grounded strictly in your course materials. Adapts teaching depth and hints to your assessment progress.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md pt-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs rounded-full"
                onClick={() => handleSendPrompt("What are the main concepts covered in this course?")}
              >
                What are the main concepts?
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs rounded-full"
                onClick={() => handleSendPrompt("Explain the core ideas step by step.")}
              >
                Explain core ideas step by step
              </Button>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={msg._id || i}
              message={msg}
              courseId={courseId}
              onSendPrompt={handleSendPrompt}
            />
          ))
        )}

        {loading && (
          <div className="flex items-start gap-4 mr-12">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
            <div className="bg-muted px-4 py-3 rounded-2xl rounded-tl-sm text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{loadingState}</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="pt-4 border-t bg-background mt-auto pb-4">
        <form className="flex gap-2 relative" onSubmit={handleFormSubmit}>
          <Input
            placeholder={
              tutorMode === "socratic"
                ? "Answer the tutor's question or ask for a guide..."
                : tutorMode === "hint"
                ? "Ask for a hint or mention the problem you are solving..."
                : "Ask an adaptive question about your course..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 rounded-full bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:ring-primary pl-4 pr-12 h-12 text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading}
            className="absolute right-1 top-1 h-10 w-10 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-[10px] text-center text-muted-foreground mt-2">
          Strictly grounded in uploaded course evidence · Adaptive pedagogy does not alter factual citations.
        </p>
      </div>
    </>
  );
}

function MessageBubble({ message, courseId, onSendPrompt }) {
  const params = useParams();
  const currentCourseId = courseId || params?.courseId;
  const isUser = message.role === "user";

  const [citationOpen, setCitationOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [whyExpanded, setWhyExpanded] = useState(false);

  const selectedSource = useQuery(
    api.sources.getSource,
    selectedCitation ? { sourceId: selectedCitation.sourceId } : "skip"
  );
  const videoRef = useRef(null);

  useEffect(() => {
    if (citationOpen && selectedCitation?.locationType === "video" && videoRef.current) {
      const t = selectedCitation.startTime || 0;
      if (videoRef.current.duration) {
        videoRef.current.currentTime = Math.min(t, videoRef.current.duration);
      } else {
        videoRef.current.currentTime = t;
      }
      videoRef.current.play().catch((e) => console.log("Auto-play prevented", e));
    }
  }, [citationOpen, selectedCitation]);

  if (isUser) {
    return (
      <div className="flex items-start gap-4 justify-end ml-12">
        <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-sm text-sm shadow-xs whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const adaptation = message.adaptation;
  const hasConcept = adaptation?.conceptName && adaptation.conceptName.trim() !== "";

  // Badge color mapping based on mastery band
  const getBandBadgeClass = (band) => {
    switch (band) {
      case "needs_attention":
        return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";
      case "developing":
        return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
      case "proficient":
        return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "strong":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
      default:
        return "border-border bg-muted/60 text-muted-foreground";
    }
  };

  const bandLabel = adaptation?.masteryBand ? adaptation.masteryBand.replace(/_/g, " ") : "Not Assessed";

  return (
    <div className="flex items-start gap-4 mr-12 group">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border">
        <MessageSquare className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 space-y-3">
        {/* V9 Learner Context Chip (Requirement #51) */}
        {hasConcept && (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border capitalize ${getBandBadgeClass(
                adaptation.masteryBand
              )}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {adaptation.conceptName} · {bandLabel}
              {adaptation.masteryPercentage !== null && adaptation.masteryPercentage !== undefined ? ` (${adaptation.masteryPercentage}%)` : ""}
            </span>

            {/* V9 Why this approach? Expandable trigger (Requirement #24, #55) */}
            {adaptation.whyThisApproach && (
              <button
                type="button"
                onClick={() => setWhyExpanded(!whyExpanded)}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md hover:bg-muted/50"
              >
                <Compass className="w-3 h-3 text-primary" />
                <span>Why this approach?</span>
                {whyExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        )}

        {/* Why this approach expansion */}
        {whyExpanded && adaptation?.whyThisApproach && (
          <div className="p-3 rounded-xl bg-muted/40 border text-xs text-muted-foreground leading-relaxed animate-in fade-in-50 duration-200">
            <div className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
              <Compass className="w-3.5 h-3.5 text-primary" />
              Adaptive Pedagogy Strategy
            </div>
            <p>{adaptation.whyThisApproach}</p>
          </div>
        )}

        {/* Markdown Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {/* V9 Prerequisite Intervention Card (Requirement #53, #54) */}
        {adaptation?.prerequisiteIntervention && adaptation.weakPrerequisiteName && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs space-y-2 mt-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Helpful prerequisite: {adaptation.weakPrerequisiteName} · Needs Attention
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] border-amber-500/40 hover:bg-amber-500/20"
                onClick={() =>
                  onSendPrompt?.(
                    `Review ${adaptation.weakPrerequisiteName} before continuing with ${adaptation.conceptName || "this concept"}.`
                  )
                }
              >
                Review
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Mastering {adaptation.weakPrerequisiteName} will make understanding this concept much easier.
            </p>
          </div>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t mt-3">
            <span className="text-xs text-muted-foreground font-medium flex items-center mr-1">Sources:</span>
            {message.citations.map((cit, i) => {
              const isVisual = cit.evidenceType === "visual";
              return (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className={`h-6 text-[10px] px-2.5 rounded-full transition-all flex items-center gap-1 ${
                    isVisual
                      ? "border-primary/50 bg-primary/10 hover:border-primary text-foreground font-medium"
                      : "border-primary/20 hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setSelectedCitation(cit);
                    setCitationOpen(true);
                  }}
                >
                  {isVisual ? <span className="text-primary font-bold">▣</span> : <span>[{i + 1}]</span>}
                  <span className="truncate max-w-[140px]">{cit.sourceName}</span>
                  {cit.locationType === "page" && cit.pageNumber ? ` • p.${cit.pageNumber}` : ""}
                  {cit.locationType === "slide" && cit.slideNumber ? ` • Slide ${formatSlideNumber(cit.slideNumber)}` : ""}
                  {cit.locationType === "video" && cit.startTime !== undefined
                    ? isVisual
                      ? ` • ${formatTimestamp(cit.startTime)}`
                      : ` • ${formatTimestamp(cit.startTime)}–${formatTimestamp(cit.endTime)}`
                    : ""}
                  {isVisual && cit.visualType ? ` • ${cit.visualType}` : ""}
                </Button>
              );
            })}
          </div>
        )}

        {/* V9 Adaptive Follow-up Suggestions Chips (Requirement #49) */}
        {adaptation?.followUpSuggestions && adaptation.followUpSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 mt-2">
            {adaptation.followUpSuggestions.map((suggestion, sIdx) => (
              <Button
                key={sIdx}
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2.5 rounded-full border border-primary/20 hover:border-primary/50 bg-background/50 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => onSendPrompt?.(suggestion)}
              >
                <Lightbulb className="w-3 h-3 text-primary mr-1" />
                {suggestion}
              </Button>
            ))}
          </div>
        )}

        {!message.grounded && message.retrievalStatus === "empty" && (
          <div className="flex items-center gap-2 text-xs text-amber-500/80 bg-amber-500/10 px-3 py-2 rounded-md border border-amber-500/20">
            <Info className="w-3.5 h-3.5" />
            Answer unsupported by course materials.
          </div>
        )}
      </div>

      {/* Citation Dialog */}
      <Dialog open={citationOpen} onOpenChange={setCitationOpen}>
        <DialogContent
          className={
            selectedCitation?.evidenceType === "visual" || selectedCitation?.locationType === "video"
              ? "w-[95vw] md:w-[min(92vw,860px)] max-w-4xl max-h-[90vh] overflow-y-auto"
              : "max-w-xl"
          }
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCitation?.evidenceType === "visual" ? (
                <>
                  <span className="text-primary text-base">▣</span>
                  <span className="truncate">Visual Citation · {selectedCitation?.visualType?.toUpperCase() || "VISUAL"}</span>
                </>
              ) : selectedCitation?.locationType === "video" ? (
                <>
                  <FileText className="w-5 h-5 text-primary shrink-0" />
                  <span className="truncate">Video Citation</span>
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5 text-primary shrink-0" />
                  <span className="truncate">{selectedCitation?.sourceName}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedCitation && (
            <div className="space-y-4">
              {/* Location and Source Header */}
              <div className="flex flex-col gap-1 border-b pb-3">
                <span className="text-sm font-medium line-clamp-2">{selectedCitation.sourceName}</span>
                <div className="flex items-center gap-2 text-primary font-medium text-xs flex-wrap mt-1">
                  {selectedCitation.locationType === "video" && selectedCitation.startTime !== undefined && (
                    <span className="bg-primary/10 px-2 py-0.5 rounded font-mono">
                      ▶ {formatTimestamp(selectedCitation.startTime)}{" "}
                      {selectedCitation.endTime ? `– ${formatTimestamp(selectedCitation.endTime)}` : ""}
                    </span>
                  )}
                  {selectedCitation.locationType === "page" && selectedCitation.pageNumber && (
                    <span className="bg-muted px-2 py-0.5 rounded text-foreground">
                      Page {selectedCitation.pageNumber}
                    </span>
                  )}
                  {selectedCitation.locationType === "slide" && selectedCitation.slideNumber && (
                    <span className="bg-muted px-2 py-0.5 rounded text-foreground">
                      Slide {formatSlideNumber(selectedCitation.slideNumber)}
                    </span>
                  )}
                  {selectedCitation.visualType && (
                    <span className="bg-primary/15 text-primary px-2 py-0.5 rounded uppercase text-[10px] tracking-wider">
                      {selectedCitation.visualType}
                    </span>
                  )}
                  {selectedCitation.sectionTitle && (
                    <span className="text-muted-foreground text-xs">• {selectedCitation.sectionTitle}</span>
                  )}
                </div>
              </div>

              {/* Visual Image Preview */}
              {selectedCitation.evidenceType === "visual" && selectedCitation.imageUrl && (
                <div className="w-full bg-black/90 rounded-xl overflow-hidden flex items-center justify-center p-3 border border-white/10 max-h-[420px]">
                  <img
                    src={selectedCitation.imageUrl}
                    alt={selectedCitation.sectionTitle || "Visual Evidence"}
                    className="max-h-[390px] w-auto max-w-full object-contain rounded"
                  />
                </div>
              )}

              {/* Video Player Preview */}
              {selectedCitation.evidenceType !== "visual" &&
                selectedCitation.locationType === "video" &&
                selectedSource?.fileUrl && (
                  <div className="w-full overflow-hidden rounded-xl bg-black">
                    <video
                      ref={videoRef}
                      src={selectedSource.fileUrl}
                      controls
                      className="aspect-video w-full"
                      onLoadedMetadata={() => {
                        if (videoRef.current) {
                          const t = selectedCitation.startTime || 0;
                          if (videoRef.current.duration) {
                            videoRef.current.currentTime = Math.min(t, videoRef.current.duration);
                          } else {
                            videoRef.current.currentTime = t;
                          }
                        }
                      }}
                    />
                  </div>
                )}

              {/* Excerpt / AI Interpretation */}
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {selectedCitation.evidenceType === "visual" ? "AI Visual Interpretation" : "Evidence Excerpt"}
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 p-4 rounded-lg border font-mono max-h-48 overflow-y-auto">
                  {selectedCitation.excerpt}
                </div>
              </div>

              {/* Confidence Notes */}
              {selectedCitation.confidenceNotes && selectedCitation.confidenceNotes.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-500">
                  <span className="font-semibold">Observation Notes: </span>
                  {selectedCitation.confidenceNotes.join("; ")}
                </div>
              )}

              {/* Link to Open in Source */}
              <div className="flex items-center justify-between pt-2 border-t text-xs">
                <p className="text-muted-foreground italic">
                  Exact {selectedCitation.evidenceType === "visual" ? "visual evidence" : "excerpt"} retrieved from
                  course materials.
                </p>
                <Link
                  href={`/dashboard/courses/${currentCourseId}/sources/${selectedCitation.sourceId}`}
                  className="text-primary hover:underline font-medium flex items-center gap-1"
                >
                  Open in Source →
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
