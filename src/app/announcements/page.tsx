import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MissionPing } from "@/components/MissionPing";
import { getAnnouncements } from "@/lib/announcements";

// 管理画面での編集を再デプロイなしで即反映させるため、静的生成せず都度DBを参照する。
export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

export default async function AnnouncementsPage() {
  const announcements = await getAnnouncements();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <MissionPing missionKey="view_announcements" />
      <PageHeader title="お知らせ" />

      {announcements.length === 0 && <p className="text-center text-parchment-dim">現在、お知らせはありません。</p>}

      <div className="space-y-3">
        {announcements.map((a) => (
          <Card key={a.id}>
            <p className="text-xs text-parchment-dim">{formatDate(a.published_at)}</p>
            <p className="mt-1 text-sm font-bold text-gold-soft">{a.title}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-parchment">{a.body}</p>
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
