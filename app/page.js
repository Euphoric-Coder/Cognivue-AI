import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, BrainCircuit, Target, Network, Library, Sparkles } from "lucide-react";
import { Show, UserButton } from "@clerk/nextjs";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Decorative ambient background blobs */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/30 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-pulse pointer-events-none" />
      <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-500/30 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-pulse pointer-events-none" style={{ animationDelay: "2s" }} />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-blue-500/30 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-pulse pointer-events-none" style={{ animationDelay: "4s" }} />

      <header className="px-6 h-16 flex items-center border-b border-white/5 sticky top-0 bg-background/60 backdrop-blur-2xl z-50 transition-all duration-300">
        <Link className="flex items-center justify-center group" href="/">
          <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors shadow-[0_0_15px_rgba(var(--primary),0.1)]">
            <BrainCircuit className="h-5 w-5 text-primary" />
          </div>
          <span className="ml-3 text-lg font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            Cognivue AI
          </span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
          <Show when="signed-out">
            <Link className="text-sm font-medium hover:text-primary transition-colors" href="/sign-in">
              Sign In
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="rounded-full px-6 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
                Get Started
              </Button>
            </Link>
          </Show>
          <Show when="signed-in">
            <Link className="text-sm font-medium hover:text-primary transition-colors" href="/dashboard">
              Dashboard
            </Link>
            <div className="p-1 rounded-full border border-primary/20 hover:border-primary/50 transition-colors bg-card shadow-sm">
              <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
            </div>
          </Show>
        </nav>
      </header>
      
      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="w-full py-32 md:py-40 lg:py-48 flex justify-center items-center">
          <div className="container px-4 md:px-6 text-center space-y-10">
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary mb-4 backdrop-blur-sm">
                <Sparkles className="mr-2 h-4 w-4" />
                <span>The Future of Adaptive Learning</span>
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight sm:text-5xl leading-[1.15]">
                Turn your course materials into a <br className="hidden md:block" />
                <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  learning system built around you.
                </span>
              </h1>
              <p className="mx-auto max-w-[750px] text-muted-foreground md:text-xl/relaxed lg:text-lg/relaxed xl:text-xl/relaxed font-medium">
                Cognivue AI transforms lectures, textbooks, and slides into a source-grounded learning workspace with adaptive tutoring, assessments, and personalized mastery tracking.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Link href="/sign-up">
                <Button size="lg" className="h-14 px-10 text-base rounded-full shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)] hover:shadow-[0_0_60px_-15px_rgba(168,85,247,0.7)] hover:-translate-y-1 transition-all duration-300">
                  Start Learning Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="outline" size="lg" className="h-14 px-10 text-base rounded-full hover:bg-muted/50 backdrop-blur-sm transition-all duration-300 border-white/10 hover:border-white/20">
                  See How It Works
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full py-20 md:py-32 bg-background/40 backdrop-blur-3xl border-y border-white/5 relative flex justify-center">
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
          <div className="container px-4 md:px-6 relative z-10">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Library, title: "Multimodal Knowledge Base", desc: "Lecture videos, textbooks, slides, and notes eventually live in one structured course workspace." },
                { icon: BookOpen, title: "Source-Grounded Tutor", desc: "Answers will remain connected to exact pages, slides, and lecture timestamps in upcoming versions." },
                { icon: Target, title: "Adaptive Assessments", desc: "Future assessments will adjust according to student mastery and previous performance." },
                { icon: Network, title: "Learner Intelligence", desc: "Topic mastery and learning progress will evolve with every interaction as the pipeline expands." }
              ].map((feature, idx) => (
                <div key={idx} className="group relative space-y-4 p-8 rounded-3xl bg-card border border-white/5 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:border-primary/30 transition-all duration-500 hover:-translate-y-2 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                    <feature.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="relative z-10 text-xl font-bold bg-gradient-to-br from-foreground to-foreground/80 bg-clip-text text-transparent">{feature.title}</h3>
                  <p className="relative z-10 text-sm text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="w-full py-20 md:py-32 flex justify-center relative">
          <div className="container px-4 md:px-6 text-center space-y-16 relative z-10">
            <div className="space-y-4">
              <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">How It Works</h2>
              <p className="mx-auto max-w-[600px] text-muted-foreground text-lg">
                A seamless pipeline from course creation to personalized mastery.
              </p>
            </div>
            
            <div className="relative mx-auto max-w-5xl px-4">
              <div className="flex flex-col md:flex-row justify-between items-center relative z-10 gap-8 md:gap-4">
                {["Create Course", "Upload Sources", "Build Knowledge Base", "Learn & Assess", "Track Mastery"].map((step, index) => (
                  <div key={index} className="flex flex-col items-center flex-1 space-y-5 group">
                    <div className="relative w-16 h-16 rounded-full bg-card border-2 border-primary/20 flex items-center justify-center font-bold text-xl group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground shadow-lg transition-all duration-500 z-10">
                      {index + 1}
                      <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    </div>
                    <span className="font-semibold text-sm md:text-base text-foreground/70 group-hover:text-primary transition-colors">{step}</span>
                  </div>
                ))}
              </div>
              {/* Connector line for desktop */}
              <div className="hidden md:block absolute top-8 left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-primary/10 via-primary/50 to-primary/10 -z-0" />
            </div>
          </div>
        </section>
      </main>
      
      <footer className="w-full flex flex-col gap-4 sm:flex-row py-8 shrink-0 items-center px-6 border-t border-white/5 bg-background/60 backdrop-blur-2xl relative z-10">
        <p className="text-sm text-muted-foreground font-medium">
          © {new Date().getFullYear()} Cognivue AI. Built for Multimodal AI Hackathon 2026.
        </p>
        <nav className="sm:ml-auto flex gap-6">
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="#">
            Product
          </Link>
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="#">
            Documentation
          </Link>
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="https://github.com" target="_blank">
            GitHub
          </Link>
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="#">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
