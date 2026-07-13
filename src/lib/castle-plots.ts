import { createSupabaseServerClient } from "@/lib/supabase-server";

export type PlotStatus =
  | "draft"
  | "available"
  | "reserved"
  | "application_pending"
  | "payment_pending"
  | "sold"
  | "cancelled"
  | "suspended";

export type CastlePlot = {
  id: string;
  castle_id: string;
  allocation_id: string | null;
  plot_code: string;
  block_label: string | null;
  name: string;
  description: string | null;
  main_image_url: string | null;
  price_yen: number;
  status: PlotStatus;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export async function getPlotsForCastle(castleId: string): Promise<CastlePlot[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_plots")
    .select("*")
    .eq("castle_id", castleId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// 販売可能な区画のみ(要件書11.1/12「全国代理店向け販売可能区画一覧」用)。
export async function getAvailablePlots(): Promise<CastlePlot[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_plots")
    .select("*")
    .eq("status", "available")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// 一般公開向け(要件書11.2「城詳細」)。下書き(draft)は販売枠にまだ紐づいていない
// 内部管理用の区画のため、公開画面には出さない。
export async function getPublicPlotsForCastle(castleId: string): Promise<CastlePlot[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_plots")
    .select("*")
    .eq("castle_id", castleId)
    .neq("status", "draft")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// 一般公開向け(要件書11.3「区画詳細」)。draft(未割当の内部管理用区画)は公開しない。
export async function getPublicPlotById(plotId: string): Promise<CastlePlot | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_plots")
    .select("*")
    .eq("id", plotId)
    .neq("status", "draft")
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 管理画面から、城の物理区画をまとめて下書き登録する(実際の測量データを想定した事前登録)。
// この時点では販売開始しない(status='draft')。城主契約がactiveになった際に
// grantInitialPlotAllocation()で必要数だけ'available'へ昇格させる。
export async function bulkCreateDraftPlots(
  castleId: string,
  count: number,
  codePrefix: string,
  priceYen: number
): Promise<CastlePlot[]> {
  const supabase = createSupabaseServerClient();

  const { count: existingCount, error: countError } = await supabase
    .from("castle_plots")
    .select("id", { count: "exact", head: true })
    .eq("castle_id", castleId);
  if (countError) throw countError;

  const startIndex = (existingCount ?? 0) + 1;
  const rows = Array.from({ length: count }, (_, i) => {
    const index = startIndex + i;
    return {
      castle_id: castleId,
      plot_code: `${codePrefix}-${String(index).padStart(3, "0")}`,
      name: `${codePrefix}区画${index}`,
      price_yen: priceYen,
      status: "draft" as const,
      display_order: index,
    };
  });

  const { data, error } = await supabase.from("castle_plots").insert(rows).select("*");
  if (error) throw error;
  return data ?? [];
}

// 要件書4.3「初期30区画の販売枠割り当て」。城主契約がactiveになった時点で、
// plot_allocationsに販売枠capacity付与イベントを1件作成し、その城のまだ販売枠に
// 紐づいていない下書き区画(status='draft', allocation_id is null)から、
// 付与容量の分だけ'available'へ昇格させる。事前登録された下書き区画数が容量に
// 満たない場合は、あるだけ昇格させる(不足分は管理画面から追加登録すれば後から補える)。
export async function grantInitialPlotAllocation(
  contractId: string,
  castleId: string,
  capacity: number,
  actorName: string | null
): Promise<{ allocationId: string; promotedCount: number }> {
  const supabase = createSupabaseServerClient();

  const { data: allocation, error: allocationError } = await supabase
    .from("plot_allocations")
    .insert({
      contract_id: contractId,
      castle_id: castleId,
      stage: 1,
      granted_capacity: capacity,
      granted_by: actorName,
    })
    .select("id")
    .single();
  if (allocationError) throw allocationError;

  const { data: candidates, error: candidatesError } = await supabase
    .from("castle_plots")
    .select("id")
    .eq("castle_id", castleId)
    .eq("status", "draft")
    .is("allocation_id", null)
    .order("display_order", { ascending: true })
    .limit(capacity);
  if (candidatesError) throw candidatesError;

  const plotIds = (candidates ?? []).map((p) => p.id as string);
  if (plotIds.length > 0) {
    const { error: promoteError } = await supabase
      .from("castle_plots")
      .update({ allocation_id: allocation.id, status: "available", updated_at: new Date().toISOString() })
      .in("id", plotIds);
    if (promoteError) throw promoteError;
  }

  return { allocationId: allocation.id as string, promotedCount: plotIds.length };
}

export type PlotAllocation = {
  id: string;
  contract_id: string;
  castle_id: string;
  stage: number;
  granted_capacity: number;
  status: "active" | "revoked";
  granted_by: string | null;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export async function getPlotAllocationsForCastle(castleId: string): Promise<PlotAllocation[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("plot_allocations")
    .select("*")
    .eq("castle_id", castleId)
    .order("granted_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// 要件書21.1「販売枠の付与・回収履歴が残る」。まだ販売開始していない(available)区画は
// 下書きへ戻し、既に予約・販売済みの区画はそのまま(進行中の取引を壊さない)。
export async function revokePlotAllocation(
  allocationId: string,
  actorName: string | null,
  reason: string | null
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const { error: allocationError } = await supabase
    .from("plot_allocations")
    .update({ status: "revoked", revoked_by: actorName, revoked_at: nowIso, revoke_reason: reason })
    .eq("id", allocationId)
    .eq("status", "active");
  if (allocationError) throw allocationError;

  const { error: plotsError } = await supabase
    .from("castle_plots")
    .update({ status: "draft", allocation_id: null, updated_at: nowIso })
    .eq("allocation_id", allocationId)
    .eq("status", "available");
  if (plotsError) throw plotsError;
}
