import { createSupabaseServerClient } from "@/lib/supabase-server";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  published_at: string;
};

export async function getAnnouncements(): Promise<Announcement[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, published_at")
    .order("published_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
