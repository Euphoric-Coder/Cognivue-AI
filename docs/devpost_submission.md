# Cognivue AI — Devpost Project Submission

## 💡 Inspiration

College students and self-directed learners are overwhelmed with heterogeneous course content: dense PDF textbooks, slide decks, diagrams, and dozens of hours of video lectures. When students turn to contemporary generative AI, they run into three fatal barriers:
1. **Hallucination & Scope Creep**: Chatbots synthesize facts from their training weights rather than the specific syllabus taught by the professor.
2. **Missing Modality & Video Blindness**: Audio-visual materials are ignored or reduced to shallow text transcripts without click-to-seek video verification.
3. **Lack of Learner Modeling**: Standard LLM chats have amnesia. They don't know what concepts the student has already mastered, what misconceptions they hold, or what prerequisite blockers are halting progress.

We built **Cognivue AI** to solve these problems by engineering a grounded, multimodal learning platform powered by Google Gemini and Convex.

---

## 🚀 What It Does

Cognivue AI turns unstructured course materials into an intelligent, adaptive study system:
- **Multimodal Course Ingestion**: Parses PDFs, slides, and MP4 videos. Extracts charts, diagrams, tables, and timestamped transcript segments with millisecond precision.
- **Automated Course Knowledge Graph**: Maps concepts, importance weights, prerequisite dependencies (`PREREQUISITE_OF`), and mitigation links (`ADDRESSED_BY`) in an interactive graph.
- **Source-Grounded AI Tutor**: Answers questions with strict grounding and verifiable citations linking to exact pages, slide numbers, and video timestamps (with one-click video seek). Supports Adaptive, Socratic, Hint, Quick Review, and Deep Dive modes.
- **Grounded Assessment Engine**: Generates 8 question types with automated objective grading and rubric-based subjective evaluation.
- **Continuous Learner Model**: Tracks concept mastery scores ($0.0$ to $1.0$), confidence bands, coverage percentage, trajectory trends, and active misconceptions.
- **Personal Study Intelligence**: Generates explainable daily study plans, spaced-review queues, and prerequisite remediation priorities.
- **Built-In Demo Course**: Allows hackathon judges to launch a pre-populated *Calculus & Neural Networks* course in one click.

---

## 🛠️ How We Built It

- **Frontend**: Next.js 16 (App Router), Tailwind CSS, Lucide Icons, Shadcn UI components.
- **Authentication**: Clerk multi-tenant user authentication.
- **Reactive Database & Vectors**: Convex document database, file storage, and 3072-dimensional vector indexing.
- **AI Backend Engine**: Python FastAPI service (`v12.0.0`) with PyMuPDF, python-pptx, and FFmpeg.
- **Google DeepMind Models**:
  - `gemini-3.6-flash`: Reasoning, knowledge graph extraction, adaptive tutoring, and study planning.
  - `gemini-2.5-flash`: Visual understanding, diagram analysis, and keyframe evaluation.
  - `gemini-embedding-2`: 3072-dimensional semantic vector embeddings.
- **Testing & Benchmarking**: 15 comprehensive evaluation test suites verifying RAG faithfulness, citation accuracy, visual understanding, grading agreement, learner model stability, and security isolation.

---

## 🏆 Accomplishments That We're Proud Of

1. **Zero Hallucination with Verifiable Video Citations**: Clicking a tutor's video citation immediately jumps the video player to that exact second.
2. **Continuous Learner State Without Overwriting**: Our learner model integrates recency decay and Bayesian confidence so single guesses don't falsely boost mastery.
3. **Closed-Loop Personal Study Intelligence**: Remediation queues automatically elevate weak prerequisites before downstream topics.
4. **94%+ Faithfulness Across 15 Benchmark Suites**: Defensible, grounded metrics tested and certified before release.

---

## 🎓 What We Learned

- Multimodal RAG requires preserving semantic structural layout (slide numbers, diagram bounding boxes, video timestamps) as first-class citizens alongside text.
- Socratic tutoring requires a safety escape mechanism ("just tell me") to prevent student frustration when blocked.
- Evaluation must be treated as continuous regression gates; hard-coded metrics give false confidence, while automated test suites ensure production readiness.

---

## 🔮 What's Next for Cognivue AI

- Real-time multimodal voice tutoring with Gemini Live API.
- Integration with Canvas, Blackboard, and Google Classroom LMS.
- Collaborative study groups sharing anonymous mastery benchmarks.
