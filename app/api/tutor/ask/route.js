import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(req) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { courseId, sessionId, question } = body;

    if (!courseId || !sessionId || !question) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    const backendUrl = process.env.INGESTION_API_URL || "http://127.0.0.1:8000";
    
    const response = await fetch(`${backendUrl}/api/tutor/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        courseId,
        sessionId,
        userId,
        question
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FastAPI Tutor Error:", errorText);
      return new NextResponse("Failed to ask tutor", { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Ask Tutor Error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
