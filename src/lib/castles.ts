import { createSupabaseServerClient } from "@/lib/supabase-server";

export type CastleStatus = "draft" | "recruiting" | "published" | "hidden";

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
