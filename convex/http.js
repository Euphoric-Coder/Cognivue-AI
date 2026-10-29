import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/ingestion/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { sourceId, status, processingStage, processingProgress, processingError, pageCount, slideCount, durationSeconds, transcriptSegmentCount } = await request.json();

    await ctx.runMutation(api.ingestion.updateStatus, {
      sourceId,
      status,
      processingStage,
      processingProgress,
      processingError,
      pageCount,
      slideCount,
      durationSeconds,
      transcriptSegmentCount,
    });

    return new Response("OK", { status: 200 });
  }),
});

http.route({
  path: "/ingestion/chunks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { sourceId, chunks } = await request.json();

    await ctx.runMutation(api.ingestion.saveChunks, {
      sourceId,
      chunks,
    });

    return new Response("OK", { status: 200 });
  }),
});

http.route({
  path: "/ingestion/segments",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { sourceId, segments } = await request.json();

    const result = await ctx.runMutation(api.ingestion.saveTranscriptSegments, {
      sourceId,
      segments,
    });

    return new Response(JSON.stringify(result), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }),
});

http.route({
  path: "/ingestion/upload-visual",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const blob = await request.blob();
    const storageId = await ctx.storage.store(blob);
    const imageUrl = await ctx.storage.getUrl(storageId);

    return new Response(JSON.stringify({ storageId, imageUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }),
});

http.route({
  path: "/ingestion/visuals",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { sourceId, visuals } = await request.json();

    const result = await ctx.runMutation(api.ingestion.saveVisuals, {
      sourceId,
      visuals,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }),
});

http.route({
  path: "/ingestion/visual-chunks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { sourceId, chunks } = await request.json();

    await ctx.runMutation(api.ingestion.saveVisualChunks, {
      sourceId,
      chunks,
    });

    return new Response("OK", { status: 200 });
  }),
});

http.route({
  path: "/ingestion/visual-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { sourceId, visualStatus, visualError } = await request.json();

    await ctx.runMutation(api.ingestion.updateVisualStatus, {
      sourceId,
      visualStatus,
      visualError,
    });

    return new Response("OK", { status: 200 });
  }),
});

// V6 Knowledge Graph HTTP Endpoints
http.route({
  path: "/knowledge-graph/data",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { courseId } = await request.json();
    const data = await ctx.runQuery(api.knowledgeGraph.getBackendEvidenceData, { courseId });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }),
});

http.route({
  path: "/knowledge-graph/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { courseId, status, error } = await request.json();
    await ctx.runMutation(api.knowledgeGraph.updateGraphStatusBackend, {
      courseId,
      status,
      error: error || undefined,
    });

    return new Response("OK", { status: 200 });
  }),
});

http.route({
  path: "/knowledge-graph/save",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-ingestion-secret");
    if (signature !== (process.env.INGESTION_API_SECRET || "secret-dev-key")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const result = await ctx.runMutation(api.knowledgeGraph.saveKnowledgeGraphBackend, body);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }),
});

export default http;
