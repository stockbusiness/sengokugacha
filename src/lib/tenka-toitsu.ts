import { createSupabaseServerClient } from "@/lib/supabase-server";

export class WarlordNotOwnedError extends Error {}

export type OwnedWarlordOption = {
  id: string;
  name: string;
  rarity: string;
  imageUrl: string | null;
};

export type TenkaToitsuStatus = {
  minoConquered: boolean;
  achieved: boolean;
  selectedWarlordName: string | null;
  ownedWarlords: OwnedWarlordOption[];
};

async function isMinoConquered(userId: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();
  const { data: mino, error: minoError } = await supabase
    .from("provinces")
    .select("id")
    .eq("is_final_province", true)
    .maybeSingle();
  if (minoError) throw minoError;
  if (!mino) return false;

  const { data, error } = await supabase
    .from("user_provinces")
    .select("is_conquered")
    .eq("user_id", userId)
    .eq("province_id", mino.id)
    .maybeSingle();
  if (error) throw error;
  return data?.is_conquered ?? false;
}

async function getAchievement(userId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("achievements")
    .select("id, selected_warlord_id, warlords:selected_warlord_id(name)")
    .eq("user_id", userId)
    .eq("achievement_type", "tenka_toitsu")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTenkaToitsuStatus(userId: string): Promise<TenkaToitsuStatus> {
  const supabase = createSupabaseServerClient();

  const [minoConquered, achievement] = await Promise.all([isMinoConquered(userId), getAchievement(userId)]);

  let ownedWarlords: OwnedWarlordOption[] = [];
  if (minoConquered && !achievement) {
    const { data, error } = await supabase
      .from("user_warlords")
      .select("warlords(id, name, rarity, image_url)")
      .eq("user_id", userId);
    if (error) throw error;
    ownedWarlords = (data ?? [])
      .map((row) => row.warlords as unknown as OwnedWarlordOption | null)
      .filter((w): w is OwnedWarlordOption => w != null);
  }

  const selectedWarlord = achievement?.warlords as unknown as { name: string } | null;

  return {
    minoConquered,
    achieved: !!achievement,
    selectedWarlordName: selectedWarlord?.name ?? null,
    ownedWarlords,
  };
}

// 美濃国制圧済み・未達成の場合のみ、選択した武将を代表武将として実績を記録する(冪等)。
export async function completeTenkaToitsu(userId: string, selectedWarlordId: string): Promise<void> {
  const supabase = createSupabaseServerClient();

  const existing = await getAchievement(userId);
  if (existing) return;

  const minoConquered = await isMinoConquered(userId);
  if (!minoConquered) {
    throw new Error("美濃国がまだ制圧されていません");
  }

  const { data: owned, error: ownedError } = await supabase
    .from("user_warlords")
    .select("id")
    .eq("user_id", userId)
    .eq("warlord_id", selectedWarlordId)
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (!owned) {
    throw new WarlordNotOwnedError("所持していない武将は選択できません");
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("referring_agent_id")
    .eq("id", userId)
    .single();
  if (userError) throw userError;

  const { error: insertError } = await supabase.from("achievements").insert({
    user_id: userId,
    achievement_type: "tenka_toitsu",
    referring_agent_id: user.referring_agent_id,
    selected_warlord_id: selectedWarlordId,
  });
  if (insertError) throw insertError;
}
