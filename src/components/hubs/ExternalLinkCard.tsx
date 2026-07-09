import { Card } from "@/components/ui/Card";

// AI寺子屋・マーケット・イベントの各ハブページで使う汎用カード。
// url が未設定(管理画面で未設定)の場合は「近日公開」として非活性表示にする。
export function ExternalLinkCard({
  icon,
  title,
  description,
  url,
  onOpen,
}: {
  icon: string;
  title: string;
  description: string;
  url: string | null;
  onOpen?: () => void;
}) {
  if (!url) {
    return (
      <Card className="opacity-60">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-parchment">{title}</p>
            <p className="mt-0.5 text-xs text-parchment-dim">{description}</p>
          </div>
        </div>
        <p className="mt-2 text-right text-xs text-parchment-dim/60">近日公開</p>
      </Card>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={onOpen} className="block">
      <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-parchment">{title}</p>
            <p className="mt-0.5 text-xs text-parchment-dim">{description}</p>
          </div>
        </div>
        <p className="mt-2 text-right text-xs font-semibold text-gold-soft">詳しく見る →</p>
      </Card>
    </a>
  );
}
