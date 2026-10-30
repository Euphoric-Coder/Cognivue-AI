import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(req) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { courseId, assessmentId, questionId, conceptId, difficulty, questionType } = body;

    if (!courseId || !assessmentId || !questionId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    const backendUrl = process.env.INGESTION_API_URL || "http://127.0.0.1:8000";

    const response = await fetch(`${backendUrl}/api/assessment/regenerate-question`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        courseId,
        assessmentId,
        questionId,
        conceptId,
        difficulty,
        questionType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(errorText || "Failed to regenerate question", { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Regenerate Question Route Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
