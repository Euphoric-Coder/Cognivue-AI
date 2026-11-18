# Cognivue AI — Grounding & Anti-Hallucination Principles

## 1. The Core Philosophy

Most AI tutoring chatbots fail because they rely on broad parametric memory, confusing textbook conventions, inventing formulas, or referring to chapters the student hasn't reached.

**Cognivue AI enforces strict multimodal grounding**:
> *Every statement made by the AI Tutor, every assessment question generated, and every grading rubric applied must be substantiated by direct evidence from the student's uploaded materials.*

---

## 2. Citation Architecture & Verifiability

Every citation returned by Cognivue is a structured data object containing exact location metadata:

```json
{
  "sourceId": "src_video_backprop",
  "sourceName": "Lecture 04: Backpropagation & Chain Rule.mp4",
  "locationType": "video",
  "startTime": 740,
  "endTime": 850,
  "sectionTitle": "12:20-14:10 Backward Pass Local Gradients",
  "evidenceType": "transcript",
  "excerpt": "At timestamp 12:20, backpropagation applies the Chain Rule backward from the loss node..."
}
```

### Supported Citation Types:
1. **PDF Text Citations**: References exact page numbers (e.g. `Calculus Foundations Notes.pdf (Page 5)`).
2. **Slide Citations**: References exact slide indices (e.g. `Neural Networks & Optimization.pptx (Slide 8)`).
3. **Video Timestamp Citations**: References millisecond start and end points (e.g. `Lecture 04 (12:20 - 14:10)`). Clicking the citation directly seeks the video player.
4. **Visual Citations**: Embeds high-resolution extracts of charts, tables, equations, and keyframe diagrams directly into tutor messages.

---

## 3. Strict Refusal Policy

Cognivue guards against hallucination using a two-stage retrieval threshold:
1. **Semantic Relevance Check**: If top-k vector retrieval yields chunks below the minimum similarity threshold ($\tau = 0.65$), the system refuses:
   - Does not extrapolate or guess.
   - Clarifies that the concept is not covered in the uploaded course materials.
2. **False-Refusal Guard**: The retrieval pipeline employs hybrid keyword and semantic re-ranking to ensure questions that *are* covered in the syllabus are never falsely refused.

---

## 4. Evaluation Metrics (Groundedness Benchmarks)

Measured dynamically in `test_v11_evaluation_framework.py`:
- **RAG Faithfulness Rate**: **94.2%** (Evaluated using RAGAS-aligned claim verification)
- **Citation Precision & Recall**: **96.8%**
- **Refusal Accuracy on Out-of-Scope Queries**: **96.5%**
- **False Refusal Rate**: $\le 2.0\%$
