import { logAdminAction } from "@/lib/admin-audit-log";
import { isCastleUnlocked, type CastleUnlockLevel } from "@/lib/castle-unlock";
import { regionCompleteAchievementType } from "@/lib/regions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

export type CastleWithUnlockStatus = Castle & { unlocked: boolean };

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

  return castles.map((c) => {
    const provinceId = provinceIdByCastleId.get(c.id as string) ?? null;
    const region = provinceId ? regionByProvinceId.get(provinceId) : undefined;
    const unlocked = isCastleUnlocked(c.unlock_level as CastleUnlockLevel, {
      hasPrimaryProvince: !!provinceId,
      provinceConquered: provinceId ? conqueredProvinceIds.has(provinceId) : false,
      regionConquered: region ? conqueredRegionTypes.has(regionCompleteAchievementType(region)) : false,
    });
    return { ...c, unlocked };
  });
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
