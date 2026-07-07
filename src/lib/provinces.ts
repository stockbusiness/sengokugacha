import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ProvinceProgress = {
  id: string;
  name: string;
  region: string;
  isFinalProvince: boolean;
  unlockConditionCount: number | null;
  isConquered: boolean;
};

export type ProvinceProgressSummary = {
  provinces: ProvinceProgress[];
  conqueredCount: number;
};

export async function getProvinceProgress(userId: string): Promise<ProvinceProgressSummary> {
  const supabase = createSupabaseServerClient();

  const [{ data: provinces, error: provincesError }, { data: conqueredRows, error: conqueredError }] =
    await Promise.all([
      supabase
        .from("provinces")
        .select("id, name, region, is_final_province, unlock_condition_count, display_order")
        .order("display_order", { ascending: true }),
      supabase.from("user_provinces").select("province_id").eq("user_id", userId).eq("is_conquered", true),
    ]);

  if (provincesError) throw provincesError;
  if (conqueredError) throw conqueredError;

  const conqueredIds = new Set((conqueredRows ?? []).map((r) => r.province_id as string));

  const result: ProvinceProgress[] = (provinces ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    isFinalProvince: p.is_final_province,
    unlockConditionCount: p.unlock_condition_count,
    isConquered: conqueredIds.has(p.id),
  }));

  return { provinces: result, conqueredCount: conqueredIds.size };
}
