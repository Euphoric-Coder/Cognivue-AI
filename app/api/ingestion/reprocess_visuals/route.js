import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();
    const { sourceId, courseId } = body;

    if (!sourceId || !courseId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    const backendUrl = process.env.INGESTION_API_URL || "http://127.0.0.1:8000";
    
    const response = await fetch(`${backendUrl}/api/ingestion/reprocess_visuals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingestion-secret": process.env.INGESTION_API_SECRET || "secret-dev-key",
      },
      body: JSON.stringify({
        sourceId,
        courseId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FastAPI Error:", errorText);
      return new NextResponse("Failed to trigger visual reprocessing", { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trigger Reprocess Visuals Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
