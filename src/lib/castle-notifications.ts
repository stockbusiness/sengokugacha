import { getLineSettings } from "@/lib/line-settings";
import { pushMessage } from "@/lib/line-push";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { ContractStatus } from "@/lib/castle-lord-contracts";
import { buildCastleUnlockedMessage } from "@/modules/castle/domain/castle-unlock-progress";

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

// 国の制圧・地方の制覇で城が解放された瞬間に、その城が開いたことを本人へ通知する。
//
// 城の解放はガチャの副次的な結果でしかなく、ユーザーがそれに気づく導線が
// これまで無かった(城一覧を自分で開き直すしかない)。解放は「販売中の区画を
// 見られるようになった」瞬間でもあるので、ここで一度だけ知らせる。
//
// 送信そのものに冪等キーは無い(line-push.tsのコメント参照)ため、
// castle_unlock_notificationsのunique (user_id, castle_id)で二重送信を防ぐ。
// 先に台帳へ入れてから送るので、送信に失敗した城は再送されない(通知は
// ベストエフォート、残高・権利には一切影響しない、という既存方針に合わせる)。
export async function notifyCastlesUnlocked(
  userId: string,
  trigger: { kind: "province_conquest"; provinceId: string } | { kind: "region_completion"; region: string }
): Promise<void> {
  const lineUserId = await getLineUserIdByUserId(userId);
  if (!lineUserId) return;

  const supabase = createSupabaseServerClient();

  // 解放されうる城 = 主要国が対象の国(または対象の地方に属する国)で、
  // かつ解放条件が今回満たした条件と一致する、公開中の城。
  const provinceIds =
    trigger.kind === "province_conquest" ? [trigger.provinceId] : await getProvinceIdsInRegion(trigger.region);
  if (provinceIds.length === 0) return;

  const unlockLevel = trigger.kind === "province_conquest" ? "PROVINCE_CONQUEST_REQUIRED" : "REGION_CONQUEST_REQUIRED";

  const { data: relations, error: relationsError } = await supabase
    .from("castle_province_relations")
    .select("castle_id, province_id")
    .eq("is_primary", true)
    .in("province_id", provinceIds);
  if (relationsError) throw relationsError;

  const castleIds = (relations ?? []).map((r) => r.castle_id as string);
  if (castleIds.length === 0) return;

  const { data: castles, error: castlesError } = await supabase
    .from("castles")
    .select("id, name")
    .in("id", castleIds)
    .eq("unlock_level", unlockLevel)
    .in("status", ["recruiting", "published"]);
  if (castlesError) throw castlesError;
  if (!castles || castles.length === 0) return;

  // 未通知の城だけを台帳に確保する。ignoreDuplicates付きのupsertは
  // 既に行がある城を返さないので、返ってきた行=今回初めて通知する城になる。
  const { data: claimed, error: claimError } = await supabase
    .from("castle_unlock_notifications")
    .upsert(
      castles.map((c) => ({ user_id: userId, castle_id: c.id as string, trigger_kind: trigger.kind })),
      { onConflict: "user_id,castle_id", ignoreDuplicates: true }
    )
    .select("castle_id");
  if (claimError) throw claimError;

  const claimedIds = new Set((claimed ?? []).map((r) => r.castle_id as string));
  if (claimedIds.size === 0) return;

  const requirementLabel =
    trigger.kind === "province_conquest"
      ? `${await getProvinceName(trigger.provinceId)}の制圧`
      : `${trigger.region}地方の制覇`;

  for (const castle of castles) {
    if (!claimedIds.has(castle.id as string)) continue;
    await sendBestEffort(lineUserId, buildCastleUnlockedMessage(castle.name as string, requirementLabel));
  }
}

async function getProvinceIdsInRegion(region: string): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("provinces").select("id").eq("region", region);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

async function getProvinceName(provinceId: string): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("provinces").select("name").eq("id", provinceId).maybeSingle();
  return data?.name ?? "国";
}
