import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(req) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { courseId, forceRebuild } = body;

    if (!courseId) {
      return new NextResponse("Missing courseId", { status: 400 });
    }

    const backendUrl = process.env.INGESTION_API_URL || "http://127.0.0.1:8000";

    const response = await fetch(`${backendUrl}/api/knowledge-graph/build`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        courseId,
        userId,
        forceRebuild: !!forceRebuild,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FastAPI Knowledge Graph Error:", errorText);
      return new NextResponse(errorText || "Failed to start knowledge graph build", { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Knowledge Graph Build Route Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
