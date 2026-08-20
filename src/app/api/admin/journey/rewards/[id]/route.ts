import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { applyRewardAction, JourneyAdminRejectedError, type RewardAdminAction } from "@/lib/learning-journey-admin";

const ACTIONS: RewardAdminAction[] = ["retry", "cancel", "reverse", "release"];

// 付与要求への管理者操作。指示書§11のとおり、失敗した付与の再実行・上限保留解除・
// 取消・訂正はいずれも本部管理者(manager)限定とし、操作理由を必須にして監査ログへ残す。
//
// 実際のWallet送信はPR5。ここでは状態遷移だけを行う。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action as RewardAdminAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "操作の指定が正しくありません" }, { status: 400 });
  }

  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length === 0) {
    return NextResponse.json({ error: "操作理由を入力してください" }, { status: 400 });
  }

  try {
    const { before, after } = await applyRewardAction(id, action, {
      walletReversalTransactionId:
        typeof body?.walletReversalTransactionId === "string" ? body.walletReversalTransactionId.trim() : null,
    });

    await logAdminAction(
      await getAdminActorName(),
      `learning_journey_reward_${action}`,
      `request_id=${id} ${before} -> ${after}`,
      { targetType: "learning_journey_reward_request", targetId: id, before: { status: before }, after: { status: after } },
      { adminRole: await getAdminRole(), operationReason: reason, requestId: crypto.randomUUID() }
    );

    return NextResponse.json({ before, after });
  } catch (error) {
    if (error instanceof JourneyAdminRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("付与要求の操作に失敗しました", error);
    return NextResponse.json({ error: "操作に失敗しました。" }, { status: 500 });
  }
}
