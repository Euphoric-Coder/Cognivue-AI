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

    const { sourceId, status, processingStage, processingProgress, processingError, pageCount, slideCount } = await request.json();

    await ctx.runMutation(api.ingestion.updateStatus, {
      sourceId,
      status,
      processingStage,
      processingProgress,
      processingError,
      pageCount,
      slideCount,
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

export default http;
