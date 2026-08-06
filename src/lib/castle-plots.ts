import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { PLOT_CSV_ASSIGNABLE_STATUSES, type PlotCsvRow } from "@/modules/castle/domain/castle-csv";
import { summarizePlotScarcity, type PlotScarcitySummary } from "@/modules/castle/domain/plot-presentation";

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
  // 内覧用のメタバース物件。nullならこの区画には内覧コンテンツが無い。
  property_id: string | null;
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

// 城一覧で「販売中◯区画・◯円〜」を出すための集計。城ごとに問い合わせるとN+1になるため、
// 対象の城の公開区画をまとめて1回で取得し、JS側で城ごとに集計する
// (getPublishedCastlesForUserの既存方針と同じ)。
export async function getPlotSalesSummaryByCastle(castleIds: string[]): Promise<Map<string, PlotScarcitySummary>> {
  if (castleIds.length === 0) return new Map();

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_plots")
    .select("castle_id, price_yen, status")
    .in("castle_id", castleIds)
    .neq("status", "draft");
  if (error) throw error;

  const plotsByCastleId = new Map<string, { price_yen: number; status: string }[]>();
  for (const row of data ?? []) {
    const castleId = row.castle_id as string;
    const plots = plotsByCastleId.get(castleId);
    if (plots) {
      plots.push(row);
    } else {
      plotsByCastleId.set(castleId, [row]);
    }
  }

  const summaries = new Map<string, PlotScarcitySummary>();
  for (const [castleId, plots] of plotsByCastleId) {
    summaries.set(castleId, summarizePlotScarcity(plots));
  }
  return summaries;
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

// 区画に紐づけられた内覧物件(案3: 内覧システムと区画の接続)。
// 既存のメタバース内覧は metaverse_properties を軸に3Dシーン・ホットスポット・
// お気に入り・閲覧ログが揃っているので、区画側から物件IDを1本持たせるだけで
// その体験をそのまま再利用できる。
//
// 下書き(draft)・非表示(hidden)の物件はLIFF側の内覧導線に一切出てこないため、
// 区画に紐づいていても内覧ボタンは出さない(押しても物件が見つからないため)。
const TOUR_VISIBLE_PROPERTY_STATUSES = ["published", "coming_soon"] as const;

export type PlotTourProperty = {
  id: string;
  name: string;
  propertyCode: string;
  status: "published" | "coming_soon";
};

export async function getTourPropertyForPlot(propertyId: string | null): Promise<PlotTourProperty | null> {
  if (!propertyId) return null;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_properties")
    .select("id, property_code, name, status")
    .eq("id", propertyId)
    .in("status", TOUR_VISIBLE_PROPERTY_STATUSES)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    name: data.name as string,
    propertyCode: data.property_code as string,
    status: data.status as PlotTourProperty["status"],
  };
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

// ============================================================
// CSV取り込み(管理画面)
// ============================================================

export class PlotCsvImportRejectedError extends Error {}

export type PlotImportResult = { created: number; updated: number };

// 区画CSVの取り込み。行の検証は parsePlotCsvRecords で済ませてある前提で、ここでは
// 「この城に属さないidを混ぜていないか」「進行中・成約済みの区画を書き換えようと
// していないか」を追加で確認する。後者は、CSVで status を安全な値にしていても
// 既存行が sold や payment_pending なら上書きさせない、という趣旨のチェック。
//
// castles側と同じくトランザクションは張れないため、更新はN文に分かれる。
export async function importPlotsFromCsv(
  castleId: string,
  rows: PlotCsvRow[],
  actorName: string | null
): Promise<PlotImportResult> {
  if (rows.length === 0) throw new PlotCsvImportRejectedError("取り込む行がありません。");

  const supabase = createSupabaseServerClient();
  const updateRows = rows.filter((row) => row.id !== null);
  const insertRows = rows.filter((row) => row.id === null);

  if (updateRows.length > 0) {
    const ids = updateRows.map((row) => row.id as string);
    const { data: existing, error } = await supabase
      .from("castle_plots")
      .select("id, castle_id, status")
      .in("id", ids);
    if (error) throw error;

    const existingById = new Map((existing ?? []).map((r) => [r.id as string, r]));
    const missing = updateRows.filter((row) => !existingById.has(row.id as string));
    if (missing.length > 0) {
      throw new PlotCsvImportRejectedError(
        `存在しないidが指定されています(${missing.map((r) => `${r.lineNumber}行目`).join(", ")})。新規作成したい場合はid欄を空にしてください。`
      );
    }

    const otherCastle = updateRows.filter((row) => existingById.get(row.id as string)?.castle_id !== castleId);
    if (otherCastle.length > 0) {
      throw new PlotCsvImportRejectedError(
        `別の城の区画idが含まれています(${otherCastle.map((r) => `${r.lineNumber}行目`).join(", ")})。`
      );
    }

    // 既存行が進行中・成約済みなら、CSVからは触らせない。
    const locked = updateRows.filter(
      (row) =>
        !(PLOT_CSV_ASSIGNABLE_STATUSES as readonly string[]).includes(
          existingById.get(row.id as string)?.status as string
        )
    );
    if (locked.length > 0) {
      const detail = locked
        .map((row) => `${row.lineNumber}行目(現在の状態: ${existingById.get(row.id as string)?.status})`)
        .join(", ");
      throw new PlotCsvImportRejectedError(
        `予約・入金待ち・販売済みの区画はCSVから変更できません(${detail})。管理画面の個別操作で行ってください。`
      );
    }
  }

  const toColumns = (row: PlotCsvRow) => ({
    castle_id: castleId,
    plot_code: row.plot_code,
    name: row.name,
    block_label: row.block_label,
    price_yen: row.price_yen,
    status: row.status,
    display_order: row.display_order,
    description: row.description,
    main_image_url: row.main_image_url,
  });

  if (insertRows.length > 0) {
    const { error } = await supabase.from("castle_plots").insert(insertRows.map(toColumns));
    if (error) throw error;
  }

  const nowIso = new Date().toISOString();
  for (const row of updateRows) {
    const { error } = await supabase
      .from("castle_plots")
      .update({ ...toColumns(row), updated_at: nowIso })
      .eq("id", row.id as string);
    if (error) throw error;
  }

  await logAdminAction(
    actorName,
    "castle_plot_csv_import",
    `castle_id=${castleId} created=${insertRows.length} updated=${updateRows.length}`,
    { targetType: "castle", targetId: castleId, after: { created: insertRows.length, updated: updateRows.length } }
  );

  return { created: insertRows.length, updated: updateRows.length };
}
