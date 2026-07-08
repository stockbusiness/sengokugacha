import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLegalPage, LEGAL_PAGE_SLUGS } from "@/lib/legal-pages";

// 管理画面での編集を再デプロイなしで即反映させるため、静的生成せず都度DBを参照する。
export const dynamic = "force-dynamic";

export default async function LegalPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(LEGAL_PAGE_SLUGS as string[]).includes(slug)) {
    notFound();
  }

  const page = await getLegalPage(slug);
  if (!page) notFound();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title={page.title} />
      <Card>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-parchment">{page.body}</p>
      </Card>
      <div className="mt-6 text-center">
        <Link href="/" className="text-sm text-parchment-dim underline decoration-gold/30 underline-offset-4 transition hover:text-gold-soft">
          戦国パスポートに戻る
        </Link>
      </div>
    </div>
  );
}
