# Cognivue AI — Comprehensive Demo Script (3–5 Minutes)

**Target Audience**: Hackathon Judges, Technical Reviewers, Video Demo Observers.  
**Demonstrator Goal**: Present the complete end-to-end learning journey (Upload -> Understand -> Ask -> Explore -> Assess -> Measure -> Adapt -> Study) in an engaging, technically grounded way.

---

## 🎬 Act 1: The Problem & The Solution (0:00 – 0:45)

### Visual:
- Open browser on `http://localhost:3000`. Show the landing page with ambient glows, the headline *"Your course. Your knowledge graph. Your personal AI tutor"*, and the benchmark stats bar (94%+ Faithfulness, 96%+ Citations).

### Spoken Script:
> *"Every student knows the pain of exam week. You have 200 slides, three textbook PDFs, and 40 hours of lecture video. When you ask generic AI chatbots for help, they hallucinate equations, cite topics your professor never taught, and don't know which concepts you've actually mastered.*  
>  
> *We built **Cognivue AI** to solve this. Cognivue takes your raw course materials and turns them into a grounded, multimodal learning system with an AI Tutor, knowledge graph, assessments, learner modeling, and personal study intelligence."*

---

## 🎬 Act 2: Instant Demo Course Onboarding (0:45 – 1:30)

### Visual:
- Click **"Explore Demo Course"** on the landing page or Dashboard.
- Workspace opens into **Calculus & Neural Networks: From Derivatives to Deep Learning**.
- Point out the top badge: *"Hackathon Demo Course — Pre-loaded with multimodal materials"*.
- Click the **Sources** tab.

### Spoken Script:
> *"To make evaluation immediate for judges, we built a 1-click Demo Course. It comes pre-loaded with three diverse modalities: a Calculus PDF textbook, a Neural Networks slide deck, and a full 40-minute MP4 lecture video on Backpropagation.*  
>  
> *Notice our visual extraction engine already identified diagrams, loss curve charts, and optimizer tables from the slides, alongside timestamped video transcript segments."*

---

## 🎬 Act 3: Grounded AI Tutor & Video Click-to-Seek (1:30 – 2:30)

### Visual:
- Click the **AI Tutor** tab.
- Type in the chat: *"How does the Chain Rule apply to backpropagation in neural networks?"*
- The tutor responds with a structured explanation citing:
  - `Calculus Foundations Notes.pdf (Page 5)`
  - `Neural Networks & Optimization.pptx (Slide 8)`
  - `Lecture 04: Backpropagation & Chain Rule.mp4 (12:20 - 14:10)`
- Click the video timestamp citation `12:20`. Show the video player instantly seek to `12:20` and begin playing!
- Switch Tutor Mode from **Adaptive** to **Socratic**. Ask: *"Can you test my understanding of the derivative product?"*
- Tutor asks a guiding question rather than lecturing.

### Spoken Script:
> *"Here's where Cognivue shines: strict grounding. The Tutor doesn't guess. It gives an answer synthesized from our course materials with trusted citations. Even better — when it cites Lecture 04 at 12 minutes 20 seconds, I click the citation and the video seeks straight to the exact second where the professor explains the backward pass.*  
>  
> *We also support pedagogical modes like Socratic and Hint mode, so students learn by thinking, not just copying."*

---

## 🎬 Act 4: Course Knowledge Graph & Assessments (2:30 – 3:30)

### Visual:
- Click the **Knowledge Map** tab.
- Show the interactive graph: nodes for *Composite Functions*, *Chain Rule*, *Backpropagation*, *ReLU*, and *Vanishing Gradients*.
- Click on *Chain Rule* — show prerequisites listed (*Composite Functions*).
- Click the **Assessments** tab.
- Show the pre-graded 5-question diagnostic covering MCQ, Multiple Select, True/False, and Short Answer. Show the rubric-based grading feedback.

### Spoken Script:
> *"Under the hood, Cognivue constructed a Course Knowledge Graph using Gemini 3.6. It extracted 7 key concepts and mapped out prerequisite dependencies. The system knows you can't master the Chain Rule without understanding Composite Functions.*  
>  
> *Our Assessment Engine generates grounded multi-type questions directly from this graph, with instant objective and subjective rubric grading."*

---

## 🎬 Act 5: Learner Model & Personal Study Intelligence (3:30 – 4:30)

### Visual:
- Click the **Progress** tab.
- Show the learner model: *Chain Rule (54% Developing)*, *Gradient Descent (92% Mastered)*, and *Composite Functions (32% Novice)*.
- Click the **Study Plan** tab.
- Show **Today's Focus**:
  - 1. *Composite Functions* (Priority: Critical, Reason: Weak prerequisite blocking Chain Rule).
  - 2. *Chain Rule* (Priority: High, Reason: Active misconception regarding derivative addition).
  - 3. *Vanishing Gradients* (Priority: Medium, Reason: Ready for review).

### Spoken Script:
> *"This brings us to the ultimate payoff: Personal Study Intelligence. Cognivue maintains a persistent learner model tracking mastery and misconceptions. Notice that because our student is struggling with Composite Functions at 32%, the system elevates it to Critical Priority today. It tells you: study the prerequisite first so you unblock downstream mastery.*  
>  
> *Every recommendation is explainable, time-budgeted, and backed by source evidence."*

---

## 🎬 Act 6: Wrap-up & Technical Credibility (4:30 – 5:00)

### Visual:
- Return to the terminal or show the `evals` dashboard.
- Show `test_v12_release_smoke.py` and `test_v11_evaluation_framework.py` passing 15/15 test suites.

### Spoken Script:
> *"Everything you saw is backed by an automated 15-suite evaluation framework achieving 94% faithfulness, 96% citation accuracy, and zero security breaches. Cognivue AI transforms course materials into personal mastery. Thank you!"*
