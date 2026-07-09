import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { Announcement } from "@/lib/announcements";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
}

// 国家ニュース。新しいニュース管理機能は作らず、既存のお知らせ(announcements)を
// 流用する。管理画面(/admin/announcements)からそのまま編集できる。
export function NationNewsCard({ announcements }: { announcements: Announcement[] }) {
  if (announcements.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs text-parchment-dim">国家ニュース</p>
        <Link href="/announcements" className="text-[11px] text-gold-soft underline decoration-gold/30 underline-offset-2">
          すべて見る
        </Link>
      </div>
      <ul className="mt-2 space-y-2">
        {announcements.map((a) => (
          <li key={a.id}>
            <p className="text-xs text-parchment-dim">{formatDate(a.published_at)}</p>
            <p className="text-sm font-semibold text-parchment">{a.title}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
