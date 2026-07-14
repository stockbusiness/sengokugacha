import { logAdminAction } from "@/lib/admin-audit-log";
import type { CastleUnlockLevel } from "@/lib/castle-unlock";
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

// 一般公開する城一覧(要件書11.1)。draft/hiddenは非公開のため除外する。
export async function getPublishedCastles(): Promise<Castle[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castles")
    .select("*")
    .in("status", ["recruiting", "published"])
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCastleById(castleId: string): Promise<Castle | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("castles").select("*").eq("id", castleId).maybeSingle();
  if (error) throw error;
  return data ?? null;
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
