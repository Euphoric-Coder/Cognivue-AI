import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(req) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const {
      assessmentId,
      courseId,
      title,
      description,
      assessmentType,
      selectedConceptIds,
      difficulty,
      questionCount,
      questionTypeConfig,
    } = body;

    if (!assessmentId || !courseId) {
      return new NextResponse("Missing assessmentId or courseId", { status: 400 });
    }

    const backendUrl = process.env.INGESTION_API_URL || "http://127.0.0.1:8000";

    const response = await fetch(`${backendUrl}/api/assessment/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assessmentId,
        courseId,
        userId,
        title,
        description,
        assessmentType,
        selectedConceptIds,
        difficulty,
        questionCount,
        questionTypeConfig,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("FastAPI Assessment Generate Error:", errorText);
      return new NextResponse(errorText || "Failed to start assessment generation", { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Assessment Generate Route Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
