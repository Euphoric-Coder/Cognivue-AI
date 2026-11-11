import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND_URL = process.env.INGESTION_API_URL || "http://127.0.0.1:8000";

function isAuthorizedOperator() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_EVAL_DASHBOARD === "true" ||
    process.env.ENABLE_EVAL_DASHBOARD === "true"
  );
}

export async function GET(req) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!isAuthorizedOperator()) {
      return new NextResponse("Evaluation dashboard disabled in production", { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "metadata";
    const runId = searchParams.get("runId");
    const format = searchParams.get("format") || "json";

    let targetPath = "/api/evaluation/metadata";
    if (action === "runs") {
      targetPath = "/api/evaluation/runs";
    } else if (action === "status" && runId) {
      targetPath = `/api/evaluation/runs/${encodeURIComponent(runId)}/status`;
    } else if (action === "run" && runId) {
      targetPath = `/api/evaluation/runs/${encodeURIComponent(runId)}`;
    } else if (action === "export" && runId) {
      targetPath = `/api/evaluation/runs/${encodeURIComponent(runId)}/export?format=${encodeURIComponent(format)}`;
    }

    const resp = await fetch(`${BACKEND_URL}${targetPath}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: errText || "Backend request failed" }, { status: resp.status });
    }

    if (action === "export" && (format === "markdown" || format === "md")) {
      const text = await resp.text();
      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="evaluation_report_${runId}.md"`,
        },
      });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Evaluation API GET error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    if (!isAuthorizedOperator()) {
      return new NextResponse("Evaluation dashboard disabled in production", { status: 403 });
    }

    const body = await req.json();
    const { action = "run", ...payload } = body;

    let endpoint = "/api/evaluation/run";
    if (action === "estimate") endpoint = "/api/evaluation/estimate";
    if (action === "compare") endpoint = "/api/evaluation/compare";

    const resp = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: errText || "Evaluation execution failed" }, { status: resp.status });
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Evaluation API POST error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}

