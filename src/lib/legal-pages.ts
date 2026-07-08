import { createSupabaseServerClient } from "@/lib/supabase-server";

export type LegalPageSlug = "tokushoho" | "terms" | "privacy" | "support";

export const LEGAL_PAGE_SLUGS: LegalPageSlug[] = ["tokushoho", "terms", "privacy", "support"];

export type LegalPage = {
  slug: string;
  title: string;
  body: string;
  updated_at: string;
};

const FALLBACK_TITLES: Record<LegalPageSlug, string> = {
  tokushoho: "特定商取引法に基づく表記",
  terms: "利用規約",
  privacy: "プライバシーポリシー",
  support: "お問い合わせ",
};

export async function getLegalPage(slug: string): Promise<LegalPage | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("legal_pages").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (data) return data;

  if ((LEGAL_PAGE_SLUGS as string[]).includes(slug)) {
    return {
      slug,
      title: FALLBACK_TITLES[slug as LegalPageSlug],
      body: "管理画面(/admin/legal-pages)から内容を設定してください。",
      updated_at: new Date(0).toISOString(),
    };
  }
  return null;
}

export async function getAllLegalPages(): Promise<LegalPage[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("legal_pages").select("*").order("slug", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
