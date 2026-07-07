import { createSupabaseServerClient } from "@/lib/supabase-server";

type SlotType = "common" | "mid" | "rare";

export type CollectionWarlord = {
  id: string;
  name: string;
  rarity: string;
  slotType: SlotType;
  imageUrl: string | null;
  lore: string | null;
  owned: boolean;
  count: number;
};

export type CollectionProvince = {
  id: string;
  name: string;
  region: string;
  isFinalProvince: boolean;
  warlords: CollectionWarlord[];
};

const SLOT_ORDER: Record<SlotType, number> = { common: 0, mid: 1, rare: 2 };

export async function getCollection(userId: string): Promise<CollectionProvince[]> {
  const supabase = createSupabaseServerClient();

  const [{ data: provinces, error: provincesError }, { data: warlords, error: warlordsError }, { data: owned, error: ownedError }] =
    await Promise.all([
      supabase
        .from("provinces")
        .select("id, name, region, is_final_province, display_order")
        .order("display_order", { ascending: true }),
      supabase.from("warlords").select("id, province_id, name, rarity, slot_type, image_url, lore"),
      supabase.from("user_warlords").select("warlord_id, count").eq("user_id", userId),
    ]);

  if (provincesError) throw provincesError;
  if (warlordsError) throw warlordsError;
  if (ownedError) throw ownedError;

  const ownedMap = new Map((owned ?? []).map((o) => [o.warlord_id as string, o.count as number]));

  const warlordsByProvince = new Map<string, CollectionWarlord[]>();
  for (const w of warlords ?? []) {
    const list = warlordsByProvince.get(w.province_id) ?? [];
    list.push({
      id: w.id,
      name: w.name,
      rarity: w.rarity,
      slotType: w.slot_type as SlotType,
      imageUrl: w.image_url,
      lore: w.lore,
      owned: ownedMap.has(w.id),
      count: ownedMap.get(w.id) ?? 0,
    });
    warlordsByProvince.set(w.province_id, list);
  }

  return (provinces ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    isFinalProvince: p.is_final_province,
    warlords: (warlordsByProvince.get(p.id) ?? []).sort((a, b) => SLOT_ORDER[a.slotType] - SLOT_ORDER[b.slotType]),
  }));
}
