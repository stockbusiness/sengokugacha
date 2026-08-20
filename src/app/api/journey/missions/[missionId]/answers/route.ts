import { NextRequest, NextResponse } from "next/server";
import {
  JourneyAnswerRejectedError,
  JourneyNotAvailableError,
  submitAnswers,
} from "@/lib/learning-journey";
import { getSession } from "@/lib/session";
import type { SubmittedAnswer } from "@/modules/learning-journey/domain/grading";

// 回答の送信。採点と完了判定はすべてサーバー側で行う(指示書§11)。
export async function POST(request: NextRequest, { params }: { params: Promise<{ missionId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { missionId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.answers)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const answers: SubmittedAnswer[] = body.answers
    .filter((answer: unknown): answer is Record<string, unknown> => typeof answer === "object" && answer !== null)
    .map((answer: Record<string, unknown>) => ({
      questionId: String(answer.questionId ?? ""),
      choiceIds: Array.isArray(answer.choiceIds) ? answer.choiceIds.map(String) : [],
      freeText: typeof answer.freeText === "string" ? answer.freeText : null,
    }))
    .filter((answer: SubmittedAnswer) => answer.questionId.length > 0);

  try {
    const result = await submitAnswers(session.userId, missionId, answers, {
      selfReported: body.selfReported === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof JourneyNotAvailableError || error instanceof JourneyAnswerRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("はじまりの旅の回答送信に失敗しました", error);
    return NextResponse.json({ error: "送信に失敗しました。" }, { status: 500 });
  }
}
