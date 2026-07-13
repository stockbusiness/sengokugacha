import { getCastleLordPlanSettings } from "@/lib/castle-lord-plan-settings";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export class PlotNotAvailableError extends Error {
  constructor() {
    super("この区画は現在お申込みいただけません(すでに予約・販売済みの可能性があります)");
    this.name = "PlotNotAvailableError";
  }
}

// 要件書7.1「予約」ステップ。Cron等のバックグラウンドジョブ基盤が無いため、
// 期限切れの予約は毎回の呼び出し時に遅延失効させる(7.3「決済失敗・期限切れ時は
// 自動的に販売可能へ戻す」)。同一区画への同時予約は`plot_reservations`の
// 部分ユニークインデックス(status='pending')がDBレベルで排他制御する。
export async function reservePlot(
  plotId: string,
  buyerUserId: string,
  referralCode: string | null
): Promise<{ reservationId: string; expiresAt: string }> {
  const supabase = createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const { data: stalePending, error: staleError } = await supabase
    .from("plot_reservations")
    .select("id")
    .eq("plot_id", plotId)
    .eq("status", "pending")
    .lt("expires_at", nowIso);
  if (staleError) throw staleError;

  if (stalePending && stalePending.length > 0) {
    const staleIds = stalePending.map((r) => r.id as string);
    const { error: expireError } = await supabase
      .from("plot_reservations")
      .update({ status: "expired", updated_at: nowIso })
      .in("id", staleIds);
    if (expireError) throw expireError;

    const { error: releaseError } = await supabase
      .from("castle_plots")
      .update({ status: "available", updated_at: nowIso })
      .eq("id", plotId)
      .eq("status", "reserved");
    if (releaseError) throw releaseError;
  }

  const { data: plot, error: plotError } = await supabase
    .from("castle_plots")
    .select("id, status")
    .eq("id", plotId)
    .maybeSingle();
  if (plotError) throw plotError;
  if (!plot || plot.status !== "available") {
    throw new PlotNotAvailableError();
  }

  const settings = await getCastleLordPlanSettings();
  const expiresAt = new Date(Date.now() + settings.reservation_expiry_minutes * 60 * 1000).toISOString();

  let sellingAgentId: string | null = null;
  if (referralCode) {
    const { data: agent } = await supabase.from("agents").select("id").eq("referral_code", referralCode).maybeSingle();
    sellingAgentId = (agent?.id as string | undefined) ?? null;
  }

  const { data: reservation, error: insertError } = await supabase
    .from("plot_reservations")
    .insert({ plot_id: plotId, buyer_user_id: buyerUserId, selling_agent_id: sellingAgentId, expires_at: expiresAt })
    .select("id, expires_at")
    .single();
  if (insertError) throw new PlotNotAvailableError(); // 部分ユニークインデックス違反=既に予約済み

  const { error: updateError } = await supabase
    .from("castle_plots")
    .update({ status: "reserved", updated_at: nowIso })
    .eq("id", plotId);
  if (updateError) throw updateError;

  return { reservationId: reservation.id as string, expiresAt: reservation.expires_at as string };
}

export type PendingReservation = {
  id: string;
  plotId: string;
  buyerUserId: string;
  sellingAgentId: string | null;
  expiresAt: string;
};

export async function getPendingReservation(
  reservationId: string,
  buyerUserId: string
): Promise<PendingReservation | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("plot_reservations")
    .select("id, plot_id, buyer_user_id, selling_agent_id, expires_at, status")
    .eq("id", reservationId)
    .eq("buyer_user_id", buyerUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "pending" || new Date(data.expires_at as string) < new Date()) return null;

  return {
    id: data.id as string,
    plotId: data.plot_id as string,
    buyerUserId: data.buyer_user_id as string,
    sellingAgentId: (data.selling_agent_id as string | null) ?? null,
    expiresAt: data.expires_at as string,
  };
}

export async function linkPurchaseToReservation(reservationId: string, purchaseId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("plot_reservations")
    .update({ purchase_id: purchaseId, updated_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw error;
}

// Stripe決済確定時(要件書7.1「入金確定」)。区画を販売済みへ更新し、対応する予約を
// 「転換済み」にする。区画所有権は専用テーブルを設けず、castle_plots自体に記録する。
export async function completePlotPurchase(purchaseId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: purchase, error } = await supabase
    .from("purchases")
    .select("id, user_id, plot_id, amount")
    .eq("id", purchaseId)
    .maybeSingle();
  if (error) throw error;
  if (!purchase || !purchase.plot_id) return;

  const nowIso = new Date().toISOString();

  const { error: plotError } = await supabase
    .from("castle_plots")
    .update({
      status: "sold",
      owner_user_id: purchase.user_id,
      sold_at: nowIso,
      sold_price_yen: purchase.amount,
      updated_at: nowIso,
    })
    .eq("id", purchase.plot_id);
  if (plotError) throw plotError;

  const { error: reservationError } = await supabase
    .from("plot_reservations")
    .update({ status: "converted", updated_at: nowIso })
    .eq("purchase_id", purchaseId);
  if (reservationError) throw reservationError;
}
