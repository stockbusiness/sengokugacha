import { logAdminAction } from "@/lib/admin-audit-log";
import { getPlotSalesSummaryByCastle } from "@/lib/castle-plots";
import { isCastleUnlocked, type CastleUnlockLevel } from "@/lib/castle-unlock";
import { getUnlockProgressByCastle, type CastleUnlockProgress } from "@/lib/castle-unlock-progress";
import { regionCompleteAchievementType } from "@/lib/regions";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CastleCsvRow } from "@/modules/castle/domain/castle-csv";
import type { PlotScarcitySummary } from "@/modules/castle/domain/plot-presentation";

export type CastleStatus = "draft" | "recruiting" | "published" | "hidden";
export type CastleHistoricalReviewStatus = "unreviewed" | "reviewed";

export type Castle = {
  id: string;
  name: string;
  prefecture: string | null;
  region: string | null;
  status: CastleStatus;
  description: string | null;
  main_image_url: string | null;
  display_order: number;
  historical_lord_summary: string | null;
  unlock_level: CastleUnlockLevel;
  historical_review_status: CastleHistoricalReviewStatus;
  // 城主プラン料金の城単位の上書き。nullなら castle_lord_plan_settings の全城共通値を使う。
  lord_plan_price_yen: number | null;
  created_at: string;
  updated_at: string;
};

export type OfficialLordPartner = {
  contactName: string | null;
  companyName: string | null;
  applicantType: "individual" | "corporate";
};

// 公式城主パートナー(実装指示書v1.0 3章の用語定義)。史実城主(historical_lord_summary)
// とは別枠で表示するため、専用の取得関数を分ける。有効な契約(status='active')は
// 城につき最大1件(uq_castle_lord_contracts_active_castle)。
export async function getOfficialLordPartner(castleId: string): Promise<OfficialLordPartner | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_lord_contracts")
    .select("contact_name, company_name, applicant_type")
    .eq("castle_id", castleId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    contactName: data.contact_name,
    companyName: data.company_name,
    applicantType: data.applicant_type,
  };
}

export async function getCastleById(castleId: string): Promise<Castle | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("castles").select("*").eq("id", castleId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// plotSalesはunlocked=falseの城では常にnull(解放前は区画情報自体を見せない、
// 城詳細の /api/castles/[id]/plots が空配列を返すのと同じ方針)。
// unlockProgressはその逆で、未解放の城にだけ入る「解放まであと◯」の表示用。
export type CastleWithUnlockStatus = Castle & {
  unlocked: boolean;
  plotSales: PlotScarcitySummary | null;
  unlockProgress: CastleUnlockProgress | null;
};

// 一般公開する城一覧+ユーザーごとの解放状態(実装指示書v1.0 6-6)。
// N+1を避けるため、関連テーブルをまとめて取得してからJS側で突き合わせる。
export async function getPublishedCastlesForUser(userId: string): Promise<CastleWithUnlockStatus[]> {
  const supabase = createSupabaseServerClient();

  const { data: castles, error: castlesError } = await supabase
    .from("castles")
    .select("*")
    .in("status", ["recruiting", "published"])
    .order("display_order", { ascending: true });
  if (castlesError) throw castlesError;
  if (!castles || castles.length === 0) return [];

  const castleIds = castles.map((c) => c.id as string);
  const provinceIdByCastleId = await getPrimaryProvinceIdsByCastle(castleIds);
  const provinceIds = Array.from(new Set(provinceIdByCastleId.values()));

  const [{ data: provinces, error: provincesError }, { data: conqueredRows, error: conqueredError }] = await Promise.all([
    provinceIds.length > 0
      ? supabase.from("provinces").select("id, region").in("id", provinceIds)
      : Promise.resolve({ data: [] as { id: string; region: string }[], error: null }),
    provinceIds.length > 0
      ? supabase
          .from("user_provinces")
          .select("province_id")
          .eq("user_id", userId)
          .eq("is_conquered", true)
          .in("province_id", provinceIds)
      : Promise.resolve({ data: [] as { province_id: string }[], error: null }),
  ]);
  if (provincesError) throw provincesError;
  if (conqueredError) throw conqueredError;

  const regionByProvinceId = new Map((provinces ?? []).map((p) => [p.id as string, p.region as string]));
  const conqueredProvinceIds = new Set((conqueredRows ?? []).map((r) => r.province_id as string));

  const regions = Array.from(new Set(Array.from(regionByProvinceId.values())));
  const { data: achievements, error: achievementsError } =
    regions.length > 0
      ? await supabase
          .from("achievements")
          .select("achievement_type")
          .eq("user_id", userId)
          .in(
            "achievement_type",
            regions.map((r) => regionCompleteAchievementType(r))
          )
      : { data: [] as { achievement_type: string }[], error: null };
  if (achievementsError) throw achievementsError;
  const conqueredRegionTypes = new Set((achievements ?? []).map((a) => a.achievement_type as string));

  const withUnlockState = castles.map((c) => {
    const castleId = c.id as string;
    const provinceId = provinceIdByCastleId.get(castleId) ?? null;
    const region = provinceId ? regionByProvinceId.get(provinceId) : undefined;
    const unlocked = isCastleUnlocked(c.unlock_level as CastleUnlockLevel, {
      hasPrimaryProvince: !!provinceId,
      provinceConquered: provinceId ? conqueredProvinceIds.has(provinceId) : false,
      regionConquered: region ? conqueredRegionTypes.has(regionCompleteAchievementType(region)) : false,
    });
    return { castle: c, castleId, provinceId, unlocked };
  });

  // 解放済みの城には販売中の区画を、未解放の城には解放までの残りを出す。
  // どちらも「未解放の城は伏せる」方針を崩さない範囲の情報に留めている。
  const [plotSalesByCastleId, unlockProgressByCastleId] = await Promise.all([
    getPlotSalesSummaryByCastle(castleIds),
    getUnlockProgressByCastle(
      userId,
      withUnlockState
        .filter((entry) => !entry.unlocked)
        .map((entry) => ({
          castleId: entry.castleId,
          unlockLevel: entry.castle.unlock_level as CastleUnlockLevel,
          provinceId: entry.provinceId,
        }))
    ),
  ]);

  return withUnlockState.map(({ castle, castleId, unlocked }) => ({
    ...castle,
    unlocked,
    plotSales: unlocked ? (plotSalesByCastleId.get(castleId) ?? null) : null,
    unlockProgress: unlocked ? null : (unlockProgressByCastleId.get(castleId) ?? null),
  }));
}

// ============================================================
// 管理画面向け(城×国の主要国関連付け、実装指示書v1.0 6-1)。
// ============================================================

// 複数の城の主要国IDをまとめて取得する(一覧画面でのN+1回避)。
export async function getPrimaryProvinceIdsByCastle(castleIds: string[]): Promise<Map<string, string>> {
  if (castleIds.length === 0) return new Map();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_province_relations")
    .select("castle_id, province_id")
    .eq("is_primary", true)
    .in("castle_id", castleIds);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.castle_id as string, r.province_id as string]));
}

// 城の主要国を設定・解除する(province_id=nullで解除)。トランザクションは
// 使わず、削除→挿入の逐次処理とする(本コードベースの既存の慣習に合わせる)。
export async function setCastlePrimaryProvince(
  castleId: string,
  provinceId: string | null,
  actorName: string | null
): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { error: deleteError } = await supabase
    .from("castle_province_relations")
    .delete()
    .eq("castle_id", castleId)
    .eq("is_primary", true);
  if (deleteError) throw deleteError;

  if (provinceId) {
    const { error: upsertError } = await supabase
      .from("castle_province_relations")
      .upsert({ castle_id: castleId, province_id: provinceId, is_primary: true }, { onConflict: "castle_id,province_id" });
    if (upsertError) throw upsertError;
  }

  await logAdminAction(actorName, "castle_primary_province_update", `castle_id=${castleId} province_id=${provinceId ?? "null"}`, {
    targetType: "castle",
    targetId: castleId,
    after: { primaryProvinceId: provinceId },
  });
}

// ============================================================
// CSV取り込み・エクスポート(管理画面)
// ============================================================

export async function getAllCastlesForAdmin(): Promise<Castle[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("castles").select("*").order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export class CsvImportRejectedError extends Error {}

export type CastleImportResult = { created: number; updated: number };

// CSVの取り込み。行の検証は呼び出し側(parseCastleCsvRecords)で済ませてある前提で、
// ここでは「idで指定された城が実在するか」だけを追加で確認してから書き込む。
//
// 注意: Supabase JSクライアントから複数文へのトランザクションは張れないため、
// 更新はN文に分かれる。途中で失敗すると一部だけ反映された状態になりうる。
// 事前検証を通してから書き込むことで失敗確率を下げているが、完全な原子性は無い。
// マスタデータであり同じCSVを再取り込みすれば収束するため、この方式を選んでいる。
export async function importCastlesFromCsv(
  rows: CastleCsvRow[],
  actorName: string | null
): Promise<CastleImportResult> {
  if (rows.length === 0) throw new CsvImportRejectedError("取り込む行がありません。");

  const supabase = createSupabaseServerClient();
  const updateRows = rows.filter((row) => row.id !== null);
  const insertRows = rows.filter((row) => row.id === null);

  if (updateRows.length > 0) {
    const ids = updateRows.map((row) => row.id as string);
    const { data: existing, error } = await supabase.from("castles").select("id").in("id", ids);
    if (error) throw error;
    const existingIds = new Set((existing ?? []).map((r) => r.id as string));
    const missing = updateRows.filter((row) => !existingIds.has(row.id as string));
    if (missing.length > 0) {
      const lines = missing.map((row) => `${row.lineNumber}行目`).join(", ");
      throw new CsvImportRejectedError(
        `存在しないidが指定されています(${lines})。新規作成したい場合はid欄を空にしてください。`
      );
    }
  }

  const toColumns = (row: CastleCsvRow) => ({
    name: row.name,
    prefecture: row.prefecture,
    region: row.region,
    status: row.status,
    unlock_level: row.unlock_level,
    historical_review_status: row.historical_review_status,
    display_order: row.display_order,
    lord_plan_price_yen: row.lord_plan_price_yen,
    description: row.description,
    historical_lord_summary: row.historical_lord_summary,
    main_image_url: row.main_image_url,
  });

  if (insertRows.length > 0) {
    const { error } = await supabase.from("castles").insert(insertRows.map(toColumns));
    if (error) throw error;
  }

  const nowIso = new Date().toISOString();
  for (const row of updateRows) {
    const { error } = await supabase
      .from("castles")
      .update({ ...toColumns(row), updated_at: nowIso })
      .eq("id", row.id as string);
    if (error) throw error;
  }

  // 一括操作で対象が単一の城ではないため、targetを渡さず件数だけを残す
  // (AdminActionTargetはtargetIdが必須で、複数対象を表現できないため)。
  await logAdminAction(
    actorName,
    "castle_csv_import",
    `created=${insertRows.length} updated=${updateRows.length}`
  );

  return { created: insertRows.length, updated: updateRows.length };
}
