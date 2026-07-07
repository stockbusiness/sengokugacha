import { createSupabaseServerClient } from "@/lib/supabase-server";

export type PassportData = {
  displayName: string | null;
  rank: string;
  kokudaka: number;
  senko: number;
  gachaTickets: number;
  warlordCount: number;
  conqueredProvinceCount: number;
};

// LINEユーザーIDからパスポートユーザーを取得、なければ新規登録する。
// 登録済みユーザーの display_name は更新しない(ユーザーがLINE側で表示名を変えても
// パスポート上の表示名は最初の登録時点のものを保持する。仕様上の明記はないため、
// この方針に強い理由があるわけではなく、要件があれば都度上書きに変更する)。
export async function findOrCreateUserByLineId(
  lineUserId: string,
  displayName: string | null
) {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing.id as string;

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({ line_user_id: lineUserId, display_name: displayName })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return created.id as string;
}

export async function recordLoginToday(userId: string) {
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("login_logs")
    .upsert(
      { user_id: userId, login_date: today },
      { onConflict: "user_id,login_date", ignoreDuplicates: true }
    );

  if (error) throw error;
}

export async function getPassportData(userId: string): Promise<PassportData | null> {
  const supabase = createSupabaseServerClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("display_name, rank, kokudaka, senko, gacha_tickets")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw userError;
  if (!user) return null;

  const [{ count: warlordCount, error: warlordError }, { count: conqueredCount, error: provinceError }] =
    await Promise.all([
      supabase
        .from("user_warlords")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("user_provinces")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_conquered", true),
    ]);

  if (warlordError) throw warlordError;
  if (provinceError) throw provinceError;

  return {
    displayName: user.display_name,
    rank: user.rank,
    kokudaka: user.kokudaka,
    senko: user.senko,
    gachaTickets: user.gacha_tickets,
    warlordCount: warlordCount ?? 0,
    conqueredProvinceCount: conqueredCount ?? 0,
  };
}
