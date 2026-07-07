import { createSupabaseServerClient } from "@/lib/supabase-server";

export type LineSettings = {
  id: string;
  liff_id: string | null;
  channel_id: string | null;
};

// line_settings は1行運用。
export async function getLineSettings(): Promise<LineSettings | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("line_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
