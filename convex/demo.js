import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireUser, cascadeDeleteCourse } from "./courses";

export const getDemoCourse = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const demoCourse = await ctx.db
      .query("courses")
      .withIndex("by_user_demo", (q) => q.eq("userId", user._id).eq("isDemo", true))
      .first();

    return demoCourse || null;
  },
});

export async function seedDemoCourseForUser(ctx, user) {
  const now = Date.now();
  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Create Course
  const courseId = await ctx.db.insert("courses", {
    userId: user._id,
    name: "Calculus & Neural Networks: From Derivatives to Deep Learning",
    description: "An interactive, multimodal demonstration course covering composite functions, chain rule, backpropagation, and gradient-based optimization.",
    subject: "Mathematics / Machine Learning",
    courseCode: "MATH-CS-301",
    academicLevel: "Undergraduate / Graduate",
    status: "active",
    isDemo: true,
    knowledgeGraphStatus: "ready",
    conceptCount: 7,
    relationshipCount: 3,
    coreConceptCount: 4,
    prerequisiteCount: 2,
    graphVersion: 1,
    graphGeneratedAt: now,
    sourceSnapshotHash: "demo_hash_v12_release",
    createdAt: now - 86400000 * 3,
    updatedAt: now,
  });

  // 2. Insert 3 Sources
  const srcPdfId = await ctx.db.insert("sources", {
    courseId,
    userId: user._id,
    name: "Calculus Foundations Notes.pdf",
    originalFileName: "Calculus_Foundations_Notes.pdf",
    type: "pdf",
    mimeType: "application/pdf",
    size: 2457600,
    status: "ready",
    ragStatus: "ready",
    visualStatus: "ready",
    pageCount: 15,
    chunkCount: 3,
    processedAt: now - 86400000 * 2,
    createdAt: now - 86400000 * 3,
    updatedAt: now,
  });

  const srcPptxId = await ctx.db.insert("sources", {
    courseId,
    userId: user._id,
    name: "Neural Networks & Optimization.pptx",
    originalFileName: "Neural_Networks_Optimization.pptx",
    type: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size: 5120000,
    status: "ready",
    ragStatus: "ready",
    visualStatus: "ready",
    slideCount: 20,
    chunkCount: 4,
    visualCount: 2,
    diagramCount: 0,
    chartCount: 1,
    tableCount: 1,
    processedAt: now - 86400000 * 2,
    createdAt: now - 86400000 * 3,
    updatedAt: now,
  });

  const srcVideoId = await ctx.db.insert("sources", {
    courseId,
    userId: user._id,
    name: "Lecture 04: Backpropagation & Chain Rule.mp4",
    originalFileName: "Lecture_04_Backpropagation_Chain_Rule.mp4",
    type: "video",
    mimeType: "video/mp4",
    size: 45000000,
    status: "ready",
    ragStatus: "ready",
    visualStatus: "ready",
    durationSeconds: 2400,
    transcriptSegmentCount: 4,
    chunkCount: 4,
    visualCount: 1,
    keyframeCount: 1,
    language: "en",
    transcriptionProvider: "gemini",
    processedAt: now - 86400000 * 2,
    createdAt: now - 86400000 * 3,
    updatedAt: now,
  });

  // 3. Insert Visuals
  const visChartId = await ctx.db.insert("sourceVisuals", {
    userId: user._id,
    courseId,
    sourceId: srcPptxId,
    visualId: "vis_chart_loss_01",
    locationType: "slide",
    slideNumber: 11,
    visualType: "chart",
    title: "Training Loss vs Learning Rate Chart",
    description: "Training Loss Curve across Learning Rates showing alpha=0.01 converging smoothly downward over 50 epochs, while alpha=1.5 oscillates sharply upward indicating divergence.",
    confidence: 0.98,
    processingStatus: "ready",
    createdAt: now - 86400000 * 2,
  });

  const visTableId = await ctx.db.insert("sourceVisuals", {
    userId: user._id,
    courseId,
    sourceId: srcPptxId,
    visualId: "vis_table_optim_01",
    locationType: "slide",
    slideNumber: 12,
    visualType: "table",
    title: "Optimizer Comparison Table",
    description: "Table Columns: Optimizer | Update Rule | Memory Overhead. SGD uses raw negative gradient with low memory; Adam maintains 1st and 2nd moment estimates with 3x parameter overhead.",
    confidence: 0.97,
    processingStatus: "ready",
    createdAt: now - 86400000 * 2,
  });

  const visKeyframeId = await ctx.db.insert("sourceVisuals", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    visualId: "vis_kf_compgraph_01",
    locationType: "video",
    startTime: 780,
    endTime: 810,
    visualType: "screenshot",
    title: "Computational Graph Backward Arrow Diagram",
    description: "Keyframe Diagram at 13:00 showing multiplication gate z = x * y receiving upstream gradient dL/dz and routing x * dL/dz to y and y * dL/dz to x.",
    confidence: 0.96,
    processingStatus: "ready",
    createdAt: now - 86400000 * 2,
  });

  // 4. Insert Chunks
  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcPdfId,
    text: "A composite function f(g(x)) applies an inner function g first and passes its output into an outer function f. Understanding function decomposition is required before applying the Chain Rule.",
    locationType: "page",
    pageNumber: 2,
    evidenceType: "text",
    sectionTitle: "Composite Functions",
    chunkIndex: 0,
    characterCount: 198,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcPdfId,
    text: "The Chain Rule states that the derivative of a composite function f(g(x)) is f'(g(x)) * g'(x), multiplying the derivative of the outer function evaluated at g(x) by the derivative of the inner function g(x).",
    locationType: "page",
    pageNumber: 5,
    evidenceType: "text",
    sectionTitle: "Chain Rule Definition",
    chunkIndex: 1,
    characterCount: 216,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcPdfId,
    text: "Gradient descent iteratively updates model weights w by subtracting the learning rate alpha multiplied by the gradient of the loss function: w_new = w_old - alpha * grad(L). If alpha is too large, optimization may diverge.",
    locationType: "page",
    pageNumber: 9,
    evidenceType: "text",
    sectionTitle: "Gradient Descent Update Step",
    chunkIndex: 2,
    characterCount: 226,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcPptxId,
    text: "During deep network training with sigmoid activations, repeated multiplication of small derivatives (< 0.25) causes gradients in early layers to shrink exponentially toward zero, slowing weight updates.",
    locationType: "slide",
    slideNumber: 4,
    evidenceType: "text",
    sectionTitle: "Slide 4: Vanishing Gradients",
    chunkIndex: 0,
    characterCount: 219,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcPptxId,
    text: "The Rectified Linear Unit (ReLU) is defined as f(x) = max(0, x). For positive inputs its derivative is constantly 1, which helps mitigate vanishing gradients compared to sigmoid.",
    locationType: "slide",
    slideNumber: 8,
    evidenceType: "text",
    sectionTitle: "Slide 8: ReLU Activation Benefits",
    chunkIndex: 1,
    characterCount: 184,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcPptxId,
    sourceVisualId: visChartId,
    text: "Chart Visual Summary: Training Loss Curve across Learning Rates. Shows alpha=0.01 converging smoothly downward over 50 epochs, while alpha=1.5 oscillates sharply upward indicating divergence.",
    locationType: "slide",
    slideNumber: 11,
    evidenceType: "visual",
    visualType: "chart",
    sectionTitle: "Training Loss vs Learning Rate Chart",
    chunkIndex: 2,
    characterCount: 202,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcPptxId,
    sourceVisualId: visTableId,
    text: "Table Columns: Optimizer | Update Rule | Memory Overhead. Rows: SGD | Uses raw negative gradient | Low (1x params); Adam | Maintains first and second moment estimates | High (3x params).",
    locationType: "slide",
    slideNumber: 12,
    evidenceType: "visual",
    visualType: "table",
    sectionTitle: "Optimizer Comparison Table",
    chunkIndex: 3,
    characterCount: 190,
    createdAt: now - 86400000 * 2,
  });

  // Video Chunks & Keyframe Chunk
  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    text: "In the opening segment of Lecture 04, we model neural network forward passes as a directed acyclic computational graph where each node stores intermediate activations for derivative reuse.",
    locationType: "video",
    startTime: 30,
    endTime: 115,
    evidenceType: "text",
    sectionTitle: "00:30-01:55 Course Motivation & Computational Graphs",
    chunkIndex: 0,
    characterCount: 196,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    text: "At timestamp 12:20, backpropagation applies the Chain Rule backward from the loss node: each gate multiplies its upstream gradient by its local derivative computed during the forward pass.",
    locationType: "video",
    startTime: 740,
    endTime: 850,
    evidenceType: "text",
    sectionTitle: "12:20-14:10 Backward Pass Local Gradients",
    chunkIndex: 1,
    characterCount: 195,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    sourceVisualId: visKeyframeId,
    text: "Keyframe Diagram at 13:00 showing multiplication gate z = x * y receiving upstream gradient dL/dz and routing x * dL/dz to y and y * dL/dz to x.",
    locationType: "video",
    startTime: 780,
    endTime: 810,
    evidenceType: "visual",
    visualType: "screenshot",
    sectionTitle: "Computational Graph Backward Arrow Diagram",
    chunkIndex: 2,
    characterCount: 154,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("sourceChunks", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    text: "Near the end of Lecture 04 at 36:00, we address exploding gradients using norm-based gradient clipping with threshold tau = 1.0, rescaling the gradient vector whenever its L2 norm exceeds tau.",
    locationType: "video",
    startTime: 2160,
    endTime: 2325,
    evidenceType: "text",
    sectionTitle: "36:00-38:45 Gradient Clipping & Learning Rate Warmup",
    chunkIndex: 3,
    characterCount: 197,
    createdAt: now - 86400000 * 2,
  });

  // 5. Insert Transcript Segments with Real Timestamps
  await ctx.db.insert("transcriptSegments", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    text: "Welcome to Lecture 04. Today we bridge mathematical calculus with deep learning computational graphs.",
    startTime: 30,
    endTime: 75,
    segmentIndex: 0,
    speakerLabel: "Instructor",
    confidence: 0.98,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("transcriptSegments", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    text: "Notice that each node in forward evaluation remembers its input values so backward derivatives can be evaluated in constant time.",
    startTime: 75,
    endTime: 115,
    segmentIndex: 1,
    speakerLabel: "Instructor",
    confidence: 0.97,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("transcriptSegments", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    text: "At 12 minutes 20 seconds, we see the core rule: upstream gradient incoming times local gradient equals downstream gradient.",
    startTime: 740,
    endTime: 850,
    segmentIndex: 2,
    speakerLabel: "Instructor",
    confidence: 0.99,
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("transcriptSegments", {
    userId: user._id,
    courseId,
    sourceId: srcVideoId,
    text: "Finally at 36 minutes, remember gradient clipping prevents exploding gradients when the loss surface becomes steep.",
    startTime: 2160,
    endTime: 2325,
    segmentIndex: 3,
    speakerLabel: "Instructor",
    confidence: 0.96,
    createdAt: now - 86400000 * 2,
  });

  // 6. Insert Knowledge Graph Concepts (7)
  const conCompositeId = await ctx.db.insert("courseConcepts", {
    courseId,
    userId: user._id,
    name: "Composite Functions",
    normalizedName: "composite functions",
    description: "A function formed by composing two functions f(g(x)), where the inner function output becomes the outer function input.",
    summary: "Essential mathematical building block required before computing chain rule derivatives.",
    category: "mathematical_foundations",
    importance: "supporting",
    depthLevel: 1,
    evidenceCount: 1,
    status: "ready",
    aliases: ["Function Composition"],
    createdAt: now - 86400000 * 2,
    updatedAt: now,
  });

  const conChainRuleId = await ctx.db.insert("courseConcepts", {
    courseId,
    userId: user._id,
    name: "Chain Rule",
    normalizedName: "chain rule",
    description: "The differentiation formula for composite functions: [f(g(x))]' = f'(g(x)) * g'(x).",
    summary: "The cornerstone calculus formula powering backpropagation across nested layers.",
    category: "differentiation",
    importance: "core",
    depthLevel: 2,
    evidenceCount: 2,
    status: "ready",
    aliases: ["Chain Rule Differentiation"],
    createdAt: now - 86400000 * 2,
    updatedAt: now,
  });

  const conBackpropId = await ctx.db.insert("courseConcepts", {
    courseId,
    userId: user._id,
    name: "Backpropagation",
    normalizedName: "backpropagation",
    description: "Algorithm computing loss gradients with respect to all neural network parameters using recursive reverse-mode chain rule.",
    summary: "Core learning algorithm in modern deep learning.",
    category: "deep_learning",
    importance: "core",
    depthLevel: 3,
    evidenceCount: 2,
    status: "ready",
    aliases: ["Backward Pass"],
    createdAt: now - 86400000 * 2,
    updatedAt: now,
  });

  const conGradDescentId = await ctx.db.insert("courseConcepts", {
    courseId,
    userId: user._id,
    name: "Gradient Descent",
    normalizedName: "gradient descent",
    description: "First-order iterative optimization algorithm for finding a local minimum of a differentiable objective function.",
    summary: "Standard optimizer: w = w - alpha * grad(L).",
    category: "optimization",
    importance: "core",
    depthLevel: 2,
    evidenceCount: 2,
    status: "ready",
    aliases: ["Steepest Descent"],
    createdAt: now - 86400000 * 2,
    updatedAt: now,
  });

  const conReluId = await ctx.db.insert("courseConcepts", {
    courseId,
    userId: user._id,
    name: "ReLU Activation",
    normalizedName: "relu activation",
    description: "Activation function defined as f(x) = max(0, x), preventing vanishing gradients for positive activations.",
    summary: "Default non-linear activation in modern feed-forward and convolutional networks.",
    category: "neural_architecture",
    importance: "supporting",
    depthLevel: 2,
    evidenceCount: 1,
    status: "ready",
    aliases: ["Rectified Linear Unit"],
    createdAt: now - 86400000 * 2,
    updatedAt: now,
  });

  const conVanishingId = await ctx.db.insert("courseConcepts", {
    courseId,
    userId: user._id,
    name: "Vanishing Gradients",
    normalizedName: "vanishing gradients",
    description: "Problem in deep neural networks where gradients become exceedingly small during backpropagation through saturating activations.",
    summary: "Training failure mode mitigated by ReLU and residual connections.",
    category: "training_dynamics",
    importance: "core",
    depthLevel: 3,
    evidenceCount: 2,
    status: "ready",
    aliases: [],
    createdAt: now - 86400000 * 2,
    updatedAt: now,
  });

  const conClippingId = await ctx.db.insert("courseConcepts", {
    courseId,
    userId: user._id,
    name: "Gradient Clipping",
    normalizedName: "gradient clipping",
    description: "Technique that caps gradients at a maximum threshold to prevent exploding gradients during optimization.",
    summary: "Stability mechanism for deep recurrent and attention networks.",
    category: "training_stabilization",
    importance: "supporting",
    depthLevel: 3,
    evidenceCount: 1,
    status: "ready",
    aliases: [],
    createdAt: now - 86400000 * 2,
    updatedAt: now,
  });

  // 7. Insert Concept Relationships (3)
  await ctx.db.insert("conceptRelationships", {
    courseId,
    userId: user._id,
    fromConceptId: conCompositeId,
    toConceptId: conChainRuleId,
    relationType: "PREREQUISITE_OF",
    description: "Understanding composite functions is required prior to applying the Chain Rule.",
    strength: 0.95,
    evidenceCount: 1,
    status: "ready",
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("conceptRelationships", {
    courseId,
    userId: user._id,
    fromConceptId: conChainRuleId,
    toConceptId: conBackpropId,
    relationType: "PREREQUISITE_OF",
    description: "The Chain Rule is recursively evaluated across computational graph nodes during Backpropagation.",
    strength: 0.98,
    evidenceCount: 1,
    status: "ready",
    createdAt: now - 86400000 * 2,
  });

  await ctx.db.insert("conceptRelationships", {
    courseId,
    userId: user._id,
    fromConceptId: conVanishingId,
    toConceptId: conReluId,
    relationType: "ADDRESSED_BY",
    description: "The vanishing gradient problem caused by saturating activations is mitigated by using ReLU.",
    strength: 0.92,
    evidenceCount: 2,
    status: "ready",
    createdAt: now - 86400000 * 2,
  });

  // 8. Insert Assessment & Questions
  const assessmentId = await ctx.db.insert("assessments", {
    courseId,
    userId: user._id,
    title: "Calculus & Optimization Diagnostic",
    description: "Grounded 5-question multi-type assessment evaluating core calculus and optimization understanding.",
    type: "quiz",
    status: "published",
    questionCount: 5,
    passingScore: 70,
    timeLimitMinutes: 20,
    createdAt: now - 86400000,
    updatedAt: now - 86400000,
  });

  await ctx.db.insert("assessmentQuestions", {
    courseId,
    userId: user._id,
    assessmentId,
    questionNumber: 1,
    type: "mcq",
    prompt: "What is the correct derivative of f(g(x)) according to the Chain Rule?",
    options: [
      "f'(g(x)) + g'(x)",
      "f'(g(x)) * g'(x)",
      "f'(x) * g'(x)",
      "f(g'(x))"
    ],
    correctAnswer: "f'(g(x)) * g'(x)",
    explanation: "By the Chain Rule, the derivative of f(g(x)) is the derivative of the outer function evaluated at the inner function, multiplied by the derivative of the inner function.",
    points: 20,
    conceptId: conChainRuleId,
    createdAt: now - 86400000,
  });

  await ctx.db.insert("assessmentQuestions", {
    courseId,
    userId: user._id,
    assessmentId,
    questionNumber: 2,
    type: "true_false",
    prompt: "True or False: In gradient descent, an excessively large learning rate alpha can cause optimization to diverge.",
    options: ["True", "False"],
    correctAnswer: "True",
    explanation: "As shown in the training loss curves, if alpha is too large (e.g. alpha = 1.5), weight updates overshoot and diverge.",
    points: 20,
    conceptId: conGradDescentId,
    createdAt: now - 86400000,
  });

  await ctx.db.insert("assessmentQuestions", {
    courseId,
    userId: user._id,
    assessmentId,
    questionNumber: 3,
    type: "multi_select",
    prompt: "Which of the following activation properties are true for ReLU? (Select all that apply)",
    options: [
      "Derivative is 1 for positive inputs",
      "Mitigates vanishing gradients compared to sigmoid",
      "Saturates to 0 for large positive values",
      "Defined as f(x) = max(0, x)"
    ],
    correctAnswer: ["Derivative is 1 for positive inputs", "Mitigates vanishing gradients compared to sigmoid", "Defined as f(x) = max(0, x)"],
    explanation: "ReLU outputs max(0, x) with gradient 1 for x > 0 and does not saturate on positive values.",
    points: 20,
    conceptId: conReluId,
    createdAt: now - 86400000,
  });

  await ctx.db.insert("assessmentQuestions", {
    courseId,
    userId: user._id,
    assessmentId,
    questionNumber: 4,
    type: "short_answer",
    prompt: "What threshold tau is recommended for gradient clipping in Lecture 04 to stabilize exploding gradients?",
    correctAnswer: "1.0",
    explanation: "Lecture 04 specifies norm-based gradient clipping with threshold tau = 1.0.",
    points: 20,
    conceptId: conClippingId,
    createdAt: now - 86400000,
  });

  await ctx.db.insert("assessmentQuestions", {
    courseId,
    userId: user._id,
    assessmentId,
    questionNumber: 5,
    type: "concept_explanation",
    prompt: "Explain how decomposing an expression into a composite function f(g(x)) enables computing the derivative with the Chain Rule.",
    correctAnswer: "Identify inner function g(x) and outer function f(u); compute df/du and du/dx; multiply them together.",
    explanation: "Function decomposition breaks complex expressions into nested sub-expressions whose elementary derivatives multiply together.",
    points: 20,
    conceptId: conCompositeId,
    createdAt: now - 86400000,
  });

  // 9. Pre-populate Learner Model States demonstrating V9 Adaptive Tutoring
  // - Chain Rule: Developing, mastery 54%, 3 attempts, medium confidence
  await ctx.db.insert("learnerConceptStates", {
    userId: user._id,
    courseId,
    conceptId: conChainRuleId,
    conceptKey: "chain_rule",
    conceptName: "Chain Rule",
    masteryScore: 54,
    masteryBand: "developing",
    confidence: "medium",
    evidenceCount: 3,
    totalAttempts: 3,
    correctAttempts: 1,
    partialAttempts: 1,
    incorrectAttempts: 1,
    weightedScore: 54,
    recentScore: 50,
    difficultyExposure: { easy: 1, medium: 2, hard: 0 },
    lastObservedAt: now - 3600000 * 5,
    firstObservedAt: now - 86400000 * 2,
    trend: "stable",
    trendDelta: 0,
    readiness: "developing",
    prerequisiteCount: 1,
    modelVersion: "learner-v1",
    updatedAt: now,
  });

  // - Gradient Descent: Strong, mastery 92%, 4 attempts, high confidence
  await ctx.db.insert("learnerConceptStates", {
    userId: user._id,
    courseId,
    conceptId: conGradDescentId,
    conceptKey: "gradient_descent",
    conceptName: "Gradient Descent",
    masteryScore: 92,
    masteryBand: "mastered",
    confidence: "high",
    evidenceCount: 4,
    totalAttempts: 4,
    correctAttempts: 4,
    partialAttempts: 0,
    incorrectAttempts: 0,
    weightedScore: 92,
    recentScore: 95,
    difficultyExposure: { easy: 1, medium: 2, hard: 1 },
    lastObservedAt: now - 3600000 * 3,
    firstObservedAt: now - 86400000 * 2,
    trend: "improving",
    trendDelta: 12,
    readiness: "ready",
    prerequisiteCount: 0,
    modelVersion: "learner-v1",
    updatedAt: now,
  });

  // - Composite Functions: Needs Attention, mastery 32%, 2 attempts, low confidence, blocker for Chain Rule
  await ctx.db.insert("learnerConceptStates", {
    userId: user._id,
    courseId,
    conceptId: conCompositeId,
    conceptKey: "composite_functions",
    conceptName: "Composite Functions",
    masteryScore: 32,
    masteryBand: "novice",
    confidence: "low",
    evidenceCount: 2,
    totalAttempts: 2,
    correctAttempts: 0,
    partialAttempts: 1,
    incorrectAttempts: 1,
    weightedScore: 32,
    recentScore: 25,
    difficultyExposure: { easy: 1, medium: 1, hard: 0 },
    lastObservedAt: now - 3600000 * 8,
    firstObservedAt: now - 86400000 * 2,
    trend: "declining",
    trendDelta: -8,
    readiness: "needs_attention",
    prerequisiteCount: 0,
    modelVersion: "learner-v1",
    updatedAt: now,
  });

  // 10. Snapshot in learnerMasterySnapshots
  await ctx.db.insert("learnerMasterySnapshots", {
    userId: user._id,
    courseId,
    assessmentTitle: "Calculus & Optimization Diagnostic",
    overallMastery: 59,
    coverage: 43,
    observedConceptCount: 3,
    totalConceptCount: 7,
    reason: "assessment_graded",
    conceptDeltas: [
      { conceptId: conChainRuleId.toString(), conceptName: "Chain Rule", before: 0, after: 54, delta: 54, masteryBand: "developing", confidence: "medium", evidenceCount: 3 },
      { conceptId: conGradDescentId.toString(), conceptName: "Gradient Descent", before: 0, after: 92, delta: 92, masteryBand: "mastered", confidence: "high", evidenceCount: 4 },
      { conceptId: conCompositeId.toString(), conceptName: "Composite Functions", before: 0, after: 32, delta: 32, masteryBand: "novice", confidence: "low", evidenceCount: 2 },
    ],
    timestamp: now - 3600000 * 3,
  });

  // 11. Misconception in learnerMisconceptions
  await ctx.db.insert("learnerMisconceptions", {
    userId: user._id,
    courseId,
    conceptId: conChainRuleId,
    conceptName: "Chain Rule",
    misconceptionKey: "chain_rule_sum_confusion",
    description: "Adds outer and inner derivatives f'(g(x)) + g'(x) instead of multiplying them f'(g(x)) * g'(x).",
    evidenceText: "Student selected addition operator in diagnostic step 1.",
    severity: "medium",
    status: "active",
    sourceObservationId: null,
    detectedAt: now - 3600000 * 5,
  });

  // 12. Study Recommendations (V10)
  const recCompositeId = await ctx.db.insert("studyRecommendations", {
    userId: user._id,
    courseId,
    conceptId: conCompositeId,
    conceptName: "Composite Functions",
    conceptKey: "composite_functions",
    recommendationType: "remediate_prerequisite",
    priorityScore: 92,
    priorityBand: "critical",
    reasonCodes: ["WEAK_PREREQUISITE", "BLOCKING_DOWNSTREAM_MASTERY"],
    reasonSummary: "Weak prerequisite blocking Chain Rule mastery (Composite mastery: 32%).",
    reasonDetails: { targetConcept: "Chain Rule", upstreamConcept: "Composite Functions" },
    status: "active",
    recommendationVersion: "study-v1",
    generatedAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("studyRecommendations", {
    userId: user._id,
    courseId,
    conceptId: conChainRuleId,
    conceptName: "Chain Rule",
    conceptKey: "chain_rule",
    recommendationType: "address_misconception",
    priorityScore: 84,
    priorityBand: "high",
    reasonCodes: ["ACTIVE_MISCONCEPTION", "DEVELOPING_MASTERY"],
    reasonSummary: "Active misconception: derivative addition vs multiplication.",
    reasonDetails: { misconceptionKey: "chain_rule_sum_confusion" },
    status: "active",
    recommendationVersion: "study-v1",
    generatedAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("studyRecommendations", {
    userId: user._id,
    courseId,
    conceptId: conVanishingId,
    conceptName: "Vanishing Gradients",
    conceptKey: "vanishing_gradients",
    recommendationType: "learn",
    priorityScore: 68,
    priorityBand: "medium",
    reasonCodes: ["UNSTUDIED_CORE_TOPIC"],
    reasonSummary: "Core concept not yet assessed with slide evidence available.",
    status: "active",
    recommendationVersion: "study-v1",
    generatedAt: now,
    updatedAt: now,
  });

  // 13. Study Plan & Items
  const studyPlanId = await ctx.db.insert("studyPlans", {
    userId: user._id,
    courseId,
    title: "Today's Study Plan: Calculus to Backprop",
    planType: "daily",
    startDate: todayStr,
    endDate: todayStr,
    targetDate: todayStr,
    dailyMinutes: 45,
    status: "active",
    examReadiness: "developing",
    examReadinessDetails: { composite: "needs_work", chain_rule: "developing", gradient_descent: "solid" },
    generatedAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("studyPlanItems", {
    userId: user._id,
    courseId,
    studyPlanId,
    date: todayStr,
    conceptId: conCompositeId,
    conceptName: "Composite Functions",
    activityType: "review_source",
    durationMinutes: 15,
    priority: "critical",
    sourceId: srcPdfId,
    reason: "Remediate weak prerequisite blocking Chain Rule",
    status: "pending",
    createdAt: now,
  });

  await ctx.db.insert("studyPlanItems", {
    userId: user._id,
    courseId,
    studyPlanId,
    date: todayStr,
    conceptId: conChainRuleId,
    conceptName: "Chain Rule",
    activityType: "watch_video",
    durationMinutes: 15,
    priority: "high",
    sourceId: srcVideoId,
    reason: "Review Lecture 04: 12:20-14:10 to address derivative product misconception",
    status: "pending",
    createdAt: now,
  });

  await ctx.db.insert("studyPlanItems", {
    userId: user._id,
    courseId,
    studyPlanId,
    date: todayStr,
    conceptId: conChainRuleId,
    conceptName: "Chain Rule",
    activityType: "practice_quiz",
    durationMinutes: 15,
    priority: "medium",
    reason: "Take 5-question practice quiz to solidify chain rule mechanics",
    status: "pending",
    createdAt: now,
  });

  return courseId;
}

export const getOrCreateDemoCourse = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const existingDemo = await ctx.db
      .query("courses")
      .withIndex("by_user_demo", (q) => q.eq("userId", user._id).eq("isDemo", true))
      .first();

    if (existingDemo) {
      return existingDemo._id;
    }

    return await seedDemoCourseForUser(ctx, user);
  },
});

export const resetDemoCourse = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const existingDemo = await ctx.db
      .query("courses")
      .withIndex("by_user_demo", (q) => q.eq("userId", user._id).eq("isDemo", true))
      .first();

    if (existingDemo) {
      await cascadeDeleteCourse(ctx, existingDemo._id, user._id);
    }

    return await seedDemoCourseForUser(ctx, user);
  },
});
