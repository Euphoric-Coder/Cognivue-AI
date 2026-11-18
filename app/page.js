import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Target,
  Network,
  Library,
  Sparkles,
  Video,
  Layers,
  CalendarCheck,
  CheckCircle2,
  Cpu,
  BarChart3,
  ShieldCheck,
  Flame
} from "lucide-react";
import { Show, UserButton } from "@clerk/nextjs";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 -left-10 w-96 h-96 bg-primary/20 rounded-full mix-blend-screen filter blur-[120px] opacity-70 pointer-events-none" />
      <div className="absolute top-20 -right-10 w-96 h-96 bg-purple-500/20 rounded-full mix-blend-screen filter blur-[120px] opacity-70 pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-96 h-96 bg-cyan-500/15 rounded-full mix-blend-screen filter blur-[120px] opacity-60 pointer-events-none" />

      {/* Header */}
      <header className="px-6 h-16 flex items-center border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur-xl z-50">
        <Link className="flex items-center justify-center group" href="/">
          <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors shadow-[0_0_15px_rgba(var(--primary),0.1)]">
            <BrainCircuit className="h-5 w-5 text-primary" />
          </div>
          <span className="ml-3 text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Cognivue AI
          </span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline" href="#how-it-works">
            How It Works
          </Link>
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline" href="#features">
            Features
          </Link>
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:inline" href="#architecture">
            Architecture
          </Link>
          <Show when="signed-out">
            <Link className="text-sm font-medium hover:text-primary transition-colors" href="/sign-in">
              Sign In
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="rounded-full px-5 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
                Get Started
              </Button>
            </Link>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard">
              <Button size="sm" variant="outline" className="rounded-full px-4 border-primary/30 hover:border-primary/60">
                Dashboard
              </Button>
            </Link>
            <div className="p-1 rounded-full border border-primary/20 hover:border-primary/50 transition-colors bg-card shadow-sm">
              <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
            </div>
          </Show>
        </nav>
      </header>

      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="w-full py-24 md:py-36 lg:py-44 flex justify-center items-center">
          <div className="container px-4 md:px-6 text-center space-y-10">
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs sm:text-sm text-primary font-medium backdrop-blur-sm shadow-[0_0_20px_rgba(var(--primary),0.15)]">
                <Sparkles className="mr-2 h-4 w-4" />
                <span>Multimodal AI Hackathon 2026 • Final Release</span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.12]">
                Your course. Your knowledge graph. <br className="hidden sm:block" />
                <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  Your personal AI tutor.
                </span>
              </h1>
              <p className="mx-auto max-w-[760px] text-muted-foreground text-base sm:text-lg md:text-xl font-normal leading-relaxed">
                Turn lecture videos, slide decks, diagrams, and textbook PDFs into a grounded multimodal learning system with an AI Tutor, knowledge graph, assessments, learner modeling, and personalized study intelligence.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-2">
              <Link href="/dashboard">
                <Button size="lg" className="h-13 px-8 text-base font-semibold rounded-full shadow-[0_0_35px_-8px_rgba(168,85,247,0.5)] hover:shadow-[0_0_50px_-10px_rgba(168,85,247,0.7)] hover:-translate-y-0.5 transition-all">
                  Start Learning Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" size="lg" className="h-13 px-8 text-base font-medium rounded-full hover:bg-muted/60 backdrop-blur-sm border-primary/20 hover:border-primary/50 transition-all">
                  <Flame className="mr-2 h-4 w-4 text-orange-400" />
                  Explore Demo Course
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="ghost" size="lg" className="h-13 px-6 text-base text-muted-foreground hover:text-foreground">
                  See How It Works
                </Button>
              </Link>
            </div>

            {/* Quick Metrics Bar */}
            <div className="pt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
              {[
                { label: "RAG Faithfulness", val: "94%+", sub: "Verified against source chunks" },
                { label: "Citation Accuracy", val: "96%+", sub: "Exact page, slide & timestamp" },
                { label: "Grounded Refusal", val: "96%+", sub: "Defense against hallucination" },
                { label: "Benchmark Suites", val: "15 / 15", sub: "Automated end-to-end tests" },
              ].map((m, i) => (
                <div key={i} className="p-4 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm">
                  <div className="text-2xl font-bold text-foreground">{m.val}</div>
                  <div className="text-xs font-semibold text-primary uppercase tracking-wider">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{m.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3-Step Journey */}
        <section id="how-it-works" className="w-full py-20 md:py-28 bg-muted/20 border-y border-border/40 relative flex justify-center">
          <div className="container px-4 md:px-6 space-y-16">
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">The Complete Learning Journey</h2>
              <p className="text-muted-foreground text-base sm:text-lg">
                Upload your raw course materials and Cognivue transforms them into a personal study engine in three steps.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                {
                  step: "01",
                  title: "Upload & Ingest",
                  desc: "Drop in PDF lecture notes, PPTX slides, and MP4 lecture videos. Cognivue extracts text, transcribes video with millisecond timestamps, and extracts visual diagrams, charts, and keyframes.",
                  icon: Library,
                },
                {
                  step: "02",
                  title: "Understand & Connect",
                  desc: "Multimodal Gemini embeddings power semantic chunking while Knowledge Graph extraction maps core concepts, relationships, and prerequisite hierarchies across your entire course syllabus.",
                  icon: Network,
                },
                {
                  step: "03",
                  title: "Learn, Adapt & Master",
                  desc: "Ask the grounded AI Tutor with trusted citations, take diagnostic assessments with instant multi-type grading, track concept mastery, and follow an explainable daily study plan.",
                  icon: Target,
                },
              ].map((card, i) => (
                <div key={i} className="relative p-8 rounded-3xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-all space-y-4 group">
                  <div className="text-4xl font-black text-primary/20 group-hover:text-primary/40 transition-colors">
                    {card.step}
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <card.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{card.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Core Capabilities (7 Workspace Tabs) */}
        <section id="features" className="w-full py-24 md:py-32 flex justify-center">
          <div className="container px-4 md:px-6 space-y-16">
            <div className="text-center space-y-4 max-w-3xl mx-auto">
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary font-medium">
                Comprehensive Workspace
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Everything You Need To Master Your Course</h2>
              <p className="text-muted-foreground text-base sm:text-lg">
                Seven integrated modules engineered to take you from initial confusion to exam-ready confidence.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                {
                  icon: BookOpen,
                  title: "Grounded AI Tutor",
                  desc: "Source-grounded RAG answers with strict anti-hallucination guardrails and trusted citations linking to exact pages, slide numbers, and video timestamps.",
                },
                {
                  icon: Video,
                  title: "Multimodal Video & Visuals",
                  desc: "Timestamped video transcript search with one-click seek to the exact second. Deep extraction and visual citation of charts, diagrams, and video keyframes.",
                },
                {
                  icon: Network,
                  title: "Course Knowledge Graph",
                  desc: "Automated concept extraction and prerequisite relationship mapping. Visual interactive network graph and hierarchical list views of your syllabus.",
                },
                {
                  icon: Target,
                  title: "Grounded Assessment Engine",
                  desc: "Automated generation of MCQ, Multiple Select, True/False, Short Answer, and Concept Explanation questions with instant objective and subjective rubric grading.",
                },
                {
                  icon: BarChart3,
                  title: "Learner Model & Mastery Tracking",
                  desc: "Persistent concept-level mastery scores, confidence bands, coverage percentage, trend trajectories, and prerequisite readiness detection.",
                },
                {
                  icon: BrainCircuit,
                  title: "Adaptive Tutoring Modes",
                  desc: "Switch dynamically between Socratic dialogue, progressive multi-level hints, quick review, and deep-dive explanations tailored to your active misconceptions.",
                },
                {
                  icon: CalendarCheck,
                  title: "Personal Study Intelligence",
                  desc: "Prioritized daily focus lists, spaced-review scheduling, exam countdown preparation plans, and prerequisite remediation queues with clear reasons.",
                },
                {
                  icon: ShieldCheck,
                  title: "Strict Grounding & Security",
                  desc: "Guaranteed out-of-syllabus refusal, prompt-injection defense, user/course data isolation, and defensible citation verification.",
                },
                {
                  icon: Layers,
                  title: "Built-In Demo Course",
                  desc: "Explore a fully populated Calculus & Neural Networks course right away — complete with PDF notes, PPTX slides, timestamped video, graph, assessments, and study plan.",
                },
              ].map((feat, idx) => (
                <div key={idx} className="p-6 rounded-2xl bg-card border border-border/40 hover:border-primary/40 transition-all space-y-3 group hover:-translate-y-1">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                    <feat.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{feat.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Technical Architecture */}
        <section id="architecture" className="w-full py-20 md:py-28 bg-muted/20 border-t border-border/40 flex justify-center">
          <div className="container px-4 md:px-6 space-y-12 max-w-5xl">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-extrabold tracking-tight">Engineered for Technical Credibility</h2>
              <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto">
                Built on modern, defensible technology designed for speed, grounded accuracy, and scale.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: "Gemini 2.5 & 3.6 Flash", role: "Multimodal Generation & Visual Reasoning" },
                { name: "Gemini Embedding 2", role: "3072-dim Semantic Source Vector Indexing" },
                { name: "Convex Realtime DB", role: "Reactive State, Vector Search & Storage" },
                { name: "Next.js 16 + FastAPI", role: "Modern App Router & Scalable Python Engine" },
              ].map((tech, i) => (
                <div key={i} className="p-5 rounded-2xl bg-card border border-border/50 space-y-2">
                  <div className="flex items-center space-y-1">
                    <Cpu className="w-5 h-5 text-primary mr-2" />
                    <span className="font-bold text-sm text-foreground">{tech.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{tech.role}</p>
                </div>
              ))}
            </div>

            <div className="p-8 rounded-3xl bg-gradient-to-r from-primary/10 via-purple-500/10 to-transparent border border-primary/20 text-center space-y-4">
              <h3 className="text-2xl font-bold">Ready to see it in action?</h3>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                No setup required. Launch the interactive demo course to test video timestamp citations, Socratic tutoring, and personalized study plans.
              </p>
              <div className="pt-2">
                <Link href="/dashboard">
                  <Button size="lg" className="rounded-full px-8 shadow-lg shadow-primary/20">
                    Open Cognivue Workspace
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full flex flex-col sm:flex-row py-8 items-center px-6 border-t border-border/40 bg-background/80 backdrop-blur-xl">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Cognivue AI. Built for the Google DeepMind Multimodal AI Hackathon 2026.
        </p>
        <div className="sm:ml-auto flex gap-6 text-xs text-muted-foreground mt-4 sm:mt-0">
          <Link className="hover:text-foreground transition-colors" href="/dashboard">
            Dashboard
          </Link>
          <Link className="hover:text-foreground transition-colors" href="#features">
            Features
          </Link>
          <Link className="hover:text-foreground transition-colors" href="#architecture">
            Architecture
          </Link>
        </div>
      </footer>
    </div>
  );
}
