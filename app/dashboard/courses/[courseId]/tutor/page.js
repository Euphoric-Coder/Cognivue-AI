"use client";

import { use, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Plus, Send, FileText, Loader2, Search, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";
import { formatSlideNumber } from "@/lib/utils";

export default function TutorPage({ params }) {
  const unwrappedParams = use(params);
  const { courseId } = unwrappedParams;

  const sources = useQuery(api.sources.getCourseSources, { courseId });
  const sessions = useQuery(api.tutor.getSessions, { courseId });
  const createSession = useMutation(api.tutor.createSession);

  const [activeSessionId, setActiveSessionId] = useState(null);
  
  // Create first session if none exists and user starts typing
  useEffect(() => {
    if (sessions && sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0]._id);
    }
  }, [sessions, activeSessionId]);

  if (sources === undefined) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const ragReadySources = sources.filter(s => s.ragStatus === "ready");
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
            {sources.length > 0 ? (
               sources.some(s => s.ragStatus === "embedding" || s.ragStatus === "pending") ? 
               "Preparing your course for AI search..." : 
               "No sources are ready for AI Search yet. Check the sources tab."
            ) : (
               "Your course has no learning materials yet."
            )}
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
            setActiveSessionId(newSessionId);
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
            sessions.map(s => (
              <Button
                key={s._id}
                variant={activeSessionId === s._id ? "secondary" : "ghost"}
                className="w-full justify-start font-normal text-sm px-2 truncate h-9"
                onClick={() => setActiveSessionId(s._id)}
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
                setActiveSessionId(newSessionId);
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
  const messages = useQuery(api.tutor.getMessages, { sessionId });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setLoading(true);
    setLoadingState("Searching your course...");

    try {
      // Small delay for UX
      await new Promise(r => setTimeout(r, 600));
      setLoadingState("Building grounded response...");

      const res = await fetch("/api/tutor/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          sessionId,
          question
        })
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

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        {messages === undefined ? (
          <div className="flex justify-center mt-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
            <MessageSquare className="h-10 w-10 mb-4" />
            <p className="font-medium">Ask something about your course...</p>
            <p className="text-sm">Try asking "What are the main concepts?"</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={msg._id || i} message={msg} />
          ))
        )}
        
        {loading && (
          <div className="flex items-start gap-4 mr-12">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
            <div className="bg-muted px-4 py-3 rounded-2xl rounded-tl-sm text-sm text-muted-foreground">
              {loadingState}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="pt-4 border-t bg-background mt-auto pb-4">
        <form 
          className="flex gap-2 relative"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <Input 
            placeholder="Ask a question..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 rounded-full bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:ring-primary pl-4 pr-12 h-12"
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
          AI answers are grounded solely in your uploaded course materials.
        </p>
      </div>
    </>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const [citationOpen, setCitationOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);

  if (isUser) {
    return (
      <div className="flex items-start gap-4 justify-end ml-12">
        <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-sm text-sm shadow-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 mr-12 group">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border">
        <MessageSquare className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 space-y-3">
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        
        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t mt-3">
            <span className="text-xs text-muted-foreground font-medium flex items-center mr-1">
              Sources:
            </span>
            {message.citations.map((cit, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 rounded-full border-primary/20 hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all"
                onClick={() => {
                  setSelectedCitation(cit);
                  setCitationOpen(true);
                }}
              >
                [{i + 1}] {cit.sourceName}
                {cit.locationType === 'page' && cit.pageNumber ? ` • p.${cit.pageNumber}` : ''}
                {cit.locationType === 'slide' && cit.slideNumber ? ` • Slide ${formatSlideNumber(cit.slideNumber)}` : ''}
              </Button>
            ))}
          </div>
        )}

        {!message.grounded && message.retrievalStatus === 'empty' && (
          <div className="flex items-center gap-2 text-xs text-amber-500/80 bg-amber-500/10 px-3 py-2 rounded-md border border-amber-500/20">
            <Info className="w-3.5 h-3.5" />
            Answer unsupported by course materials.
          </div>
        )}
      </div>

      <Dialog open={citationOpen} onOpenChange={setCitationOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {selectedCitation?.sourceName}
            </DialogTitle>
          </DialogHeader>
          {selectedCitation && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground border-b pb-3">
                {selectedCitation.locationType === 'page' && (
                  <span className="bg-muted px-2 py-1 rounded">Page {selectedCitation.pageNumber}</span>
                )}
                {selectedCitation.locationType === 'slide' && (
                  <span className="bg-muted px-2 py-1 rounded">Slide {formatSlideNumber(selectedCitation.slideNumber)}</span>
                )}
                {selectedCitation.sectionTitle && (
                  <span className="font-medium">{selectedCitation.sectionTitle}</span>
                )}
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 p-4 rounded-lg border font-mono">
                {selectedCitation.excerpt}
              </div>
              <p className="text-xs text-muted-foreground italic text-center">
                This is the exact excerpt retrieved by the AI from your uploaded material.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
