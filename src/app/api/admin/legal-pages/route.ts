import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getAllLegalPages, LEGAL_PAGE_SLUGS, type LegalPage } from "@/lib/legal-pages";

const FALLBACK_TITLES: Record<string, string> = {
  tokushoho: "特定商取引法に基づく表記",
  terms: "利用規約",
  privacy: "プライバシーポリシー",
};

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const existing = await getAllLegalPages();
  const bySlug = new Map(existing.map((p) => [p.slug, p]));

  // マイグレーション未反映等でまだ行が無いslugも編集フォームには出す。
  const pages: LegalPage[] = LEGAL_PAGE_SLUGS.map(
    (slug) =>
      bySlug.get(slug) ?? {
        slug,
        title: FALLBACK_TITLES[slug],
        body: "",
        updated_at: new Date(0).toISOString(),
      }
  );

  return NextResponse.json(pages);
}
