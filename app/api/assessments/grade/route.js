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
      courseId,
      questionId,
      studentAnswer,
      referenceAnswer,
      requiredKeyPoints,
      optionalKeyPoints,
      misconceptionIndicators,
      rubric,
      sourceEvidence,
      maxPoints,
    } = body;

    const backendUrl = process.env.INGESTION_API_URL || "http://127.0.0.1:8000";

    const response = await fetch(`${backendUrl}/api/assessment/grade-subjective`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        courseId,
        questionId,
        studentAnswer,
        referenceAnswer,
        requiredKeyPoints,
        optionalKeyPoints,
        misconceptionIndicators,
        rubric,
        sourceEvidence,
        maxPoints,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(errorText || "Failed to grade subjective question", { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Subjective Grade Route Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
