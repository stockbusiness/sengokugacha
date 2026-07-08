import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getFaqs } from "@/lib/faqs";

// 管理画面での編集を再デプロイなしで即反映させるため、静的生成せず都度DBを参照する。
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const faqs = await getFaqs();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="よくある質問" />

      {faqs.length === 0 && <p className="text-center text-parchment-dim">現在、FAQは登録されていません。</p>}

      <div className="space-y-3">
        {faqs.map((faq) => (
          <Card key={faq.id}>
            <p className="text-sm font-bold text-gold-soft">Q. {faq.question}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-parchment">A. {faq.answer}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 text-center">
        <Link href="/guide" className="text-sm text-parchment-dim underline decoration-gold/30 underline-offset-4 transition hover:text-gold-soft">
          遊び方に戻る
        </Link>
      </div>
    </div>
  );
}
