import { getLineSettings } from "@/lib/line-settings";
import { pushMessage } from "@/lib/line-push";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { ContractStatus } from "@/lib/castle-lord-contracts";

// LINE通知の送信失敗は本来の処理(契約遷移・決済確定等)を失敗させない
// (pushAgentToExternalの「外部連携はベストエフォート」という既存方針を踏襲)。
async function sendBestEffort(lineUserId: string | null | undefined, text: string): Promise<void> {
  if (!lineUserId) return;
  try {
    const settings = await getLineSettings();
    if (!settings?.messaging_channel_access_token) return;
    await pushMessage(settings.messaging_channel_access_token, lineUserId, text);
  } catch (error) {
    console.error("LINE個別通知の送信に失敗しました", error);
  }
}

async function getLineUserIdByUserId(userId: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("users").select("line_user_id").eq("id", userId).maybeSingle();
  return data?.line_user_id ?? null;
}

const SCREENING_RESULT_MESSAGE: Partial<Record<ContractStatus, string>> = {
  approved: "【戦国パスポート】城主プランの審査が承認されました。次のステップ(契約・お支払い)についてご案内します。",
  terminated: "【戦国パスポート】城主プランの審査結果についてご連絡します。誠に恐れ入りますが、今回は見送りとさせていただきました。",
};

// 城主契約の状態遷移に応じて、対象ユーザーへLINE個別通知を送る。
// Phase1スコープの4イベント(審査結果/入金確認・研修完了→有効化/区画購入確定/報酬確定)のうち、
// 契約関連の3イベントをここで扱う(区画購入確定・報酬確定はPR7/PR8で追加する)。
export async function notifyContractTransition(
  applicantUserId: string,
  fromStatus: ContractStatus,
  toStatus: ContractStatus
): Promise<void> {
  const lineUserId = await getLineUserIdByUserId(applicantUserId);
  if (!lineUserId) return;

  if (fromStatus === "screening" && toStatus in SCREENING_RESULT_MESSAGE) {
    await sendBestEffort(lineUserId, SCREENING_RESULT_MESSAGE[toStatus]!);
    return;
  }

  if (toStatus === "training") {
    await sendBestEffort(lineUserId, "【戦国パスポート】城主プランのお支払いを確認しました。引き続き研修にお進みください。");
    return;
  }

  if (toStatus === "active") {
    await sendBestEffort(lineUserId, "【戦国パスポート】研修が完了し、正式に城主として有効化されました。城主ダッシュボードをご確認ください。");
    return;
  }
}

// 区画購入確定(Phase1スコープの4イベントのうち③)。
// モジュール化後バグ修正・Phase B改修指示書§4.3.3。唯一の呼び出し元(src/lib/purchase-grants.ts)が
// notification_outbox_eventsへの記録・送信結果の追跡を行うため、他の通知関数と異なり
// ベストエフォート(sendBestEffort)で握りつぶさず、送信結果をboolean(実際に送信を試みたか)で
// 返し、送信失敗時は例外をそのまま伝播する。
export async function notifyPlotPurchase(buyerUserId: string, plotId: string | null): Promise<boolean> {
  if (!plotId) return false;
  const lineUserId = await getLineUserIdByUserId(buyerUserId);
  if (!lineUserId) return false;

  const supabase = createSupabaseServerClient();
  const { data: plot } = await supabase.from("castle_plots").select("name").eq("id", plotId).maybeSingle();
  const plotName = plot?.name ?? "区画";

  const settings = await getLineSettings();
  if (!settings?.messaging_channel_access_token) return false;

  await pushMessage(
    settings.messaging_channel_access_token,
    lineUserId,
    `【戦国パスポート】「${plotName}」のご購入が確定しました。マイページからご確認いただけます。`
  );
  return true;
}

// 報酬確定(Phase1スコープの4イベントのうち④)。受取者がLINEユーザーとして
// 特定できる場合(recipient_type='lord'等、recipient_user_idが設定されている行)のみ送信する。
// 代理店(recipient_agent_id)宛はLINE通知の対象外(代理店ポータル側の表示のみ)。
export async function notifyCommissionConfirmed(recipientUserId: string): Promise<void> {
  const lineUserId = await getLineUserIdByUserId(recipientUserId);
  if (!lineUserId) return;
  await sendBestEffort(lineUserId, "【戦国パスポート】土地販売報酬が確定しました。ダッシュボードからご確認いただけます。");
}

// 報酬取消・反対仕訳(返金連動)。
export async function notifyCommissionReversed(recipientUserId: string): Promise<void> {
  const lineUserId = await getLineUserIdByUserId(recipientUserId);
  if (!lineUserId) return;
  await sendBestEffort(lineUserId, "【戦国パスポート】返金に伴い、一部の土地販売報酬が取り消されました。ダッシュボードからご確認いただけます。");
}
