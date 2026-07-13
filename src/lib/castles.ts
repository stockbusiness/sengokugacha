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
  created_at: string;
  updated_at: string;
};

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
