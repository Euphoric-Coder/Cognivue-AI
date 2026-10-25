# Cognivue AI — Version 6 Implementation Report: Course Knowledge Graph

## 1. Executive Summary & V6 Architecture

Cognivue AI has been successfully upgraded from **Version 5 (Multimodal Visual Understanding)** to **Version 6 (Course Knowledge Graph)**. 

In Version 6, a course is no longer merely a container of disconnected PDF, PPTX, and video sources. It is now a **structured, semantic, and inspectable knowledge model** where educational concepts are automatically identified, organized, cross-referenced, and connected through grounded relationships.

### Grounding Invariant
> **Strict Grounding Rule:** A concept or relationship exists in the knowledge graph **if and only if** Cognivue AI can point to verified, uploaded course evidence supporting it. The graph is never generated from Gemini's world knowledge or ungrounded heuristics.

```
Uploaded Course Sources (PDF, PPTX, Video)
                    │
                    ▼
     [Source Evidence Extraction]
     • Source Chunks (Text RAG)
     • Timestamped Transcript Segments
     • Visual & Diagram Interpretations
                    │
                    ▼
     [Stage 1: Map Concept Candidates]
     Gemini 2.5 Flash Structured Schema
     (Untrusted content delimited; resolves CONTEXT_N IDs)
                    │
                    ▼
     [Stage 2: Reduce & Normalization]
     • Lexical stop-word & whitespace normalization
     • Alias grouping & syntactic/semantic equivalence
     • Cross-source deduplication (PDF + PPTX + Video -> 1 Concept)
     • Frequency & centrality importance promotion (core, supporting, minor)
                    │
                    ▼
     [Stage 3: Grounded Relationship Extraction]
     Controlled vocabulary (PREREQUISITE_OF, DEPENDS_ON, PART_OF, etc.)
     Evidence citation requirement & high/medium confidence filtering
                    │
                    ▼
     [Stage 4: Graph Validation & Safety]
     • Concept & evidence referential integrity
     • Self-edge & duplicate edge elimination
     • Topological Prerequisite Cycle Detection (KNOWLEDGE_GRAPH_PREREQUISITE_CYCLE)
       -> Automatic cycle break & downgrade to RELATED_TO
                    │
                    ▼
     [Stage 5: Atomic Persistence & UI]
     Convex Transaction: Replaces previous graph atomically
     Native Interactive SVG Graph + Accessible Categorized List View
```

---

## 2. Convex Data Model & Schema Changes

The Convex schema ([`convex/schema.js`](file:///Users/sagnikdey/Desktop/PROJECTS/AIML/Cognivue%20AI/convex/schema.js)) was extended with three dedicated tables and enriched course metadata:

### 2.1 Course Metadata (`courses` Table Updates)
```javascript
knowledgeGraphStatus: v.optional(v.union(
  v.literal("not_started"),
  v.literal("building"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("outdated")
)),
knowledgeGraphError: v.optional(v.string()),
conceptCount: v.optional(v.number()),
relationshipCount: v.optional(v.number()),
coreConceptCount: v.optional(v.number()),
prerequisiteCount: v.optional(v.number()),
graphVersion: v.optional(v.number()),
graphGeneratedAt: v.optional(v.number()),
sourceSnapshotHash: v.optional(v.string()),
```

### 2.2 Concepts Table (`courseConcepts`)
Represents extracted, deduplicated educational entities.
- `userId` (string) & `courseId` (id("courses"))
- `name` (string) — Clean canonical title case name (e.g., "Chain Rule")
- `normalizedName` (string) — Deterministic search key (e.g., "chain rule")
- `description` (string) — Grounded summary of the concept
- `type` (union) — `topic`, `concept`, `formula`, `method`, `definition`, `process`, `system`, `entity`, `principle`, `skill`, `other`
- `importance` (union) — `core`, `supporting`, `minor`
- `aliases` (array of strings) — Accepted semantic and syntactic variants
- `sourceCount` (number) & `evidenceCount` (number)
- `masteryEligible` (boolean) — Flag reserved for future learning tracking (no V7/V8 logic)
- **Indexes:** `by_course`, `by_user`, `by_course_normalized`, `by_course_importance`

### 2.3 Relationships Table (`conceptRelationships`)
Represents directed semantic edges between concepts with strict evidence provenance.
- `userId` (string) & `courseId` (id("courses"))
- `fromConceptId` (id("courseConcepts")) & `toConceptId` (id("courseConcepts"))
- `relationType` (union) — `PREREQUISITE_OF`, `DEPENDS_ON`, `PART_OF`, `RELATED_TO`, `APPLIES_TO`, `USED_FOR`, `EXAMPLE_OF`, `CONTRASTS_WITH`, `CAUSES`, `FOLLOWS`
- `confidence` (union) — `high`, `medium`, `low`
- `evidenceIds` (array of id("conceptEvidence"))
- `explanation` (optional string) — Grounded reason explaining the connection
- **Indexes:** `by_course`, `by_user`, `by_from_concept`, `by_to_concept`, `by_course_from`, `by_course_to`, `by_pair`

### 2.4 Evidence Table (`conceptEvidence`)
Links concepts and relationships directly to primary course media.
- `userId`, `courseId`, `conceptId`
- `sourceId` (id("sources"))
- `evidenceType` (union) — `text`, `visual`, `video_transcript`, `video_visual`
- `sourceChunkId` (optional id("sourceChunks"))
- `sourceVisualId` (optional id("sourceVisuals"))
- `pageNumber` (optional number) — PDF provenance
- `slideNumber` (optional number) — PPTX provenance
- `startTime` & `endTime` (optional numbers) — Video transcript/visual provenance
- `excerpt` (string) — Grounded excerpt or visual description
- `confidence` (number 0.0 - 1.0)
- **Indexes:** `by_course`, `by_concept`, `by_source`, `by_course_concept`

---

## 3. Extraction & Staging Strategy (Map-Reduce)

To handle large courses without hitting Gemini token context limits or suffering prompt truncation, extraction runs as a staged map-reduce pipeline ([`backend/app/services/knowledge_graph/graph_builder.py`](file:///Users/sagnikdey/Desktop/PROJECTS/AIML/Cognivue%20AI/backend/app/services/knowledge_graph/graph_builder.py)):

1. **Evidence Grouping (Map Phase):**
   - Course evidence is collected in batches of 15 items across text chunks, transcript segments, and visual descriptions.
   - Each item is assigned an opaque token (`CONTEXT_0`, `CONTEXT_1`, etc.).
2. **Concept Candidate Extraction:**
   - Gemini 2.5 Flash is called using Pydantic structured schemas ([`backend/app/services/knowledge_graph/concept_extractor.py`](file:///Users/sagnikdey/Desktop/PROJECTS/AIML/Cognivue%20AI/backend/app/services/knowledge_graph/concept_extractor.py)).
   - Untrusted course content is enclosed within strict isolation tags `<COURSE_MATERIAL>` to defend against prompt injection.
   - The model returns candidate names, types, descriptions, importance, and references to `evidenceContextIds`.
   - The backend maps `evidenceContextIds` back to verified database IDs, timestamps, and page numbers, preventing model fabrication.
3. **Concept Merging (Reduce Phase):**
   - Candidate concepts across all batches are merged and deduplicated using lexical normalization and alias grouping ([`backend/app/services/knowledge_graph/concept_normalizer.py`](file:///Users/sagnikdey/Desktop/PROJECTS/AIML/Cognivue%20AI/backend/app/services/knowledge_graph/concept_normalizer.py)).
4. **Relationship Extraction:**
   - Grounded relationships are extracted only between verified concepts using evidence segments that mention or link both concepts ([`backend/app/services/knowledge_graph/relationship_extractor.py`](file:///Users/sagnikdey/Desktop/PROJECTS/AIML/Cognivue%20AI/backend/app/services/knowledge_graph/relationship_extractor.py)).
   - Every relationship must cite its supporting evidence.
5. **Graph Validation:**
   - Enforces referential integrity, removes duplicates, and analyzes prerequisite directed acyclic graphs ([`backend/app/services/knowledge_graph/graph_validator.py`](file:///Users/sagnikdey/Desktop/PROJECTS/AIML/Cognivue%20AI/backend/app/services/knowledge_graph/graph_validator.py)).

---

## 4. Normalization & Deduplication Strategy

Educational concepts frequently appear under slightly different names across different media (e.g., `"The Chain Rule"`, `"Chain Rule"`, `"chain rule differentiation"`).

### 4.1 Lexical & Syntactic Normalization
- Removes leading stop words (`the `, `a `, `an `).
- Strips punctuation and collapses extra whitespace.
- Recognizes common educational suffixes: `" rule"`, `" law"`, `" method"`, `" formula"`, `" concept"`, `" process"`, `" system"`, `" engine"`, `" transactions"`, `" ledger"`.

### 4.2 Canonical Name Selection
- The normalizer selects the cleanest, title-cased name.
- It penalizes leading stop articles (`"The "`) so that `"Chain Rule"` is preferred over `"The Chain Rule"`.
- It penalizes overly verbose phrasing.

### 4.3 Multimodal Cross-Source Fusion
When a concept appears across PDF lecture notes, PPTX slides, and MP4 video recordings:
- Exactly **one** `courseConcept` record is preserved.
- All evidence items from PDF pages, slide numbers, and video timestamps are attached to that single concept.
- Concepts appearing across multiple sources or with high occurrence counts are automatically promoted from `supporting` to `core`.

---

## 5. Relationship Vocabulary & Prerequisite Safeguards

### 5.1 Controlled Vocabulary
To prevent semantic drift, relationships are restricted to:
- `PREREQUISITE_OF`
- `DEPENDS_ON`
- `PART_OF`
- `RELATED_TO`
- `APPLIES_TO`
- `USED_FOR`
- `EXAMPLE_OF`
- `CONTRASTS_WITH`
- `CAUSES`
- `FOLLOWS`

### 5.2 Prerequisite Safeguards & Cycle Detection
Prerequisites directly dictate educational learning order. Casual or speculative prerequisite inference is prohibited.
- **Evidence Requirement:** Relationships must have supporting evidence from course texts.
- **Topological Cycle Detection:** Prerequisite edges (`PREREQUISITE_OF`, `DEPENDS_ON`) are checked for cycles via Depth-First Search.
- **Cycle Resolution:** If a cycle is detected (e.g., $A \to B \to A$), it is logged as `KNOWLEDGE_GRAPH_PREREQUISITE_CYCLE` with concept names. The cycle-forming edge is automatically downgraded to `RELATED_TO` so that downstream learning paths never encounter an infinite loop.

---

## 6. Graph Stale Detection & Idempotent Rebuilds

### 6.1 State Lifecycle
A course's knowledge graph transitions across 5 well-defined states:
- `not_started`: Initial state when no graph has been generated.
- `building`: Background worker is actively executing extraction, normalization, and validation.
- `ready`: Graph is validated, persisted, and ready for exploration.
- `failed`: An error occurred during extraction; existing sources and RAG continue to work normally.
- `outdated`: A source was added, deleted, or reprocessed.

### 6.2 Deterministic Snapshot Hashing
Every build computes a deterministic SHA-256 hash of all AI-ready source IDs, versions, and update timestamps.
- Adding a source, deleting a source, or reprocessing a source triggers `markGraphOutdated` in Convex.
- The UI displays an amber notification banner: *"Course sources have been modified since this knowledge graph was generated. Rebuild to update concepts."*

### 6.3 Rebuild Idempotency & Atomic Swap
- Rebuilding a course with unchanged materials produces the exact same number of concepts, relationships, and evidence items.
- In Convex mutation `saveKnowledgeGraphBackend`, the previous graph's concepts, relationships, and evidence items are cleanly replaced in a single atomic transaction. No orphaned or duplicate records are left behind.

---

## 7. Frontend Knowledge Map User Interface

The Knowledge Map tab ([`app/dashboard/courses/[courseId]/knowledge-map/page.js`](file:///Users/sagnikdey/Desktop/PROJECTS/AIML/Cognivue%20AI/app/dashboard/courses/[courseId]/knowledge-map/page.js)) provides a rich, responsive interface:

1. **Interactive Force/SVG Graph (`interactive-graph.jsx`):**
   - Native SVG canvas with zoom, pan, node dragging, and physics relaxation.
   - Node badges indicate concept type and importance (Core, Supporting, Minor) with clean visual accents.
   - Clickable edge chips displaying relationship verbs.
   - Dynamic hover highlights showing 1-hop connected neighborhoods.
2. **Concept Details Drawer (`concept-details-sheet.jsx`):**
   - Opens upon clicking any concept node.
   - Displays description, type, importance, and connected incoming/outgoing relationships.
   - **Clickable Grounded Evidence:** Opens PDF pages, PPTX slides, seeks video to exact timestamps, or displays visual diagram citations.
   - **[Ask AI Tutor]:** Prefills the tutor chat with `"Explain [Concept Name] using my course materials."` and navigates seamlessly.
3. **Relationship Explanation Modal (`edge-details-dialog.jsx`):**
   - Opens upon clicking any relationship edge chip.
   - Explains *"Why are these connected?"* with exact cited evidence text and source links.
4. **Accessible List View (`concept-list-view.jsx`):**
   - Instant toggle between interactive graph and categorized list view.
   - Grouped into Core Concepts, Supporting Concepts, and Minor Concepts with source and evidence counters.
5. **Real-time Search & Filtering:**
   - Instant search input filtering nodes by name.
   - Filter pills for All, Core, Definitions, Methods, Processes, Formulas, and Prerequisites.
6. **Course Overview Metric Card (`app/dashboard/courses/[courseId]/page.js`):**
   - Displays real-time counts of Concepts, Relationships, Core Concepts, and Prerequisites on the main course dashboard.

---

## 8. Automated Test Suite & Regression Verification

Comprehensive automated test suites were written and verified against the live environment.

### 8.1 Knowledge Graph Test Suite (`tests/test_v6_knowledge_graph.py`)
Ran 10 tests in 17.388s — **100% OK**:

| Test | Objective | Result |
|------|-----------|--------|
| `test_01_concept_normalization_and_aliases` | Verifies stop word removal and alias equivalence | **PASS** |
| `test_02_cross_source_concept_deduplication` | Confirms identical concepts across PDF, PPTX, Video merge into 1 node | **PASS** |
| `test_03_multimodal_concept_evidence_fusion` | Validates multi-source evidence preservation (transcript + diagram) | **PASS** |
| `test_04_grounded_relationship_extraction` | Enforces controlled vocabulary and supporting evidence requirement | **PASS** |
| `test_05_rebuild_idempotency_and_stale_cleanup` | Validates that rebuilds do not duplicate concepts or relationships | **PASS** |
| `test_06_prerequisite_cycle_detection_and_resolution` | Detects cycles, logs `KNOWLEDGE_GRAPH_PREREQUISITE_CYCLE`, downgrades edge | **PASS** |
| `test_07_no_unsupported_concept_hallucination` | Ensures ungrounded concepts (e.g. Quantum Entanglement) are omitted | **PASS** |
| `test_08_prompt_injection_defense` | Verifies untrusted course content cannot hijack extraction prompts | **PASS** |
| `test_09_course_and_user_isolation` | Verifies concepts and edges are strictly segmented by course and user | **PASS** |
| `test_10_status_lifecycle_and_stale_detection` | Confirms transition across `not_started`, `building`, `ready`, and `outdated` | **PASS** |

### 8.2 V1–V5 Regression Suite Results
All existing capabilities were verified to ensure zero regression:
- **`tests/test_v5_v1_v4_regression.py`**: 5 tests in 8.404s — **PASS** (Text RAG, video seek alignment, citation formatting, strict refusal).
- **`tests/test_v5_multimodal_pipeline.py`**: 11 tests in 36.414s — **PASS** (Diagram extraction, visual classification, table understanding, multimodal embedding).
- **`tests/test_v5_e2e_integration.py`**: 4 tests in 21.413s — **PASS** (End-to-end multimodal queries and visual citations).

---

## 9. Structured Logging Reference

The following structured logs are emitted during graph operations:
- `KG_BUILD_START` (`courseId=...`, `userId=...`, `sourceCount=...`)
- `KG_SOURCE_EVIDENCE_COLLECTED` (`textChunks=...`, `videoSegments=...`, `visuals=...`)
- `KG_CONCEPT_EXTRACTION` (`batch=...`, `candidatesExtracted=...`)
- `KG_CONCEPT_MERGE` (`rawCount=...`, `mergedCount=...`, `coreCount=...`)
- `KG_RELATIONSHIP_EXTRACTION` (`relationshipsInferred=...`)
- `KG_VALIDATION` (`validConcepts=...`, `validRelationships=...`, `cyclesResolved=...`)
- `KG_BUILD_COMPLETE` (`concepts=...`, `relationships=...`, `evidence=...`)
- `KG_BUILD_FAILED` (`error=...`)
- `KG_MARKED_OUTDATED` (`reason=source_added|source_deleted|source_reprocessed`)
- `KNOWLEDGE_GRAPH_PREREQUISITE_CYCLE` (`cycle=ConceptA -> ConceptB -> ConceptA`)

---

## 10. Boundaries & Out-of-Scope Confirmations

- **Version 7 Exclusions Strictly Maintained:** No quiz generation, multiple-choice questions, mock exams, grading engines, or question banks were introduced.
- **Version 8+ Exclusions Strictly Maintained:** No Bayesian Knowledge Tracing (BKT), Item Response Theory (IRT), adaptive difficulty algorithms, or spaced repetition models were added.
- The `masteryEligible` field in `courseConcepts` is purely a passive schema indicator reserved for future versions.

---

## 11. Conclusion

Cognivue AI Version 6 transforms raw educational media into a rich, interconnected, grounded conceptual network. Students and educators can now visually navigate the semantic landscape of their courses, inspect exact evidence citations behind every connection, and ask targeted questions with full confidence in evidence-based grounding.
