"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { MissionPing } from "@/components/MissionPing";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type Status = "loading" | "ready" | "error";
type ExternalLink = { key: string; label: string; url: string };

export default function AcademyPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [links, setLinks] = useState<ExternalLink[]>([]);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;

    fetch("/api/links")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ExternalLink[]) => {
        if (!cancelled) setLinks(data);
      })
      .catch(() => {
        /* 送客導線はおまけ機能のため、取得失敗しても本文表示は継続する */
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <LoadingSpinner />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      </div>
    );
  }

  const artSchoolUrl = links.find((l) => l.key === "ai_art_school")?.url ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <MissionPing missionKey="view_terakoya" />

      {/* 寺子屋の情景(和室・障子・行灯の灯り)。実写ではなくCSS/SVGによる装飾。 */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-gold/25">
        <div className="relative flex h-44 items-end justify-center bg-gradient-to-b from-[#2a1f14] via-[#1c140d] to-ink">
          {/* 障子(格子) */}
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, transparent 0 30px, rgba(245,245,245,0.6) 30px 32px), repeating-linear-gradient(0deg, transparent 0 30px, rgba(245,245,245,0.6) 30px 32px)",
            }}
          />
          {/* 行灯の灯り */}
          <div className="lantern-glow absolute left-1/2 top-6 h-24 w-24 -translate-x-1/2 rounded-full bg-gold/30 blur-2xl" />
          {/* 先生のシルエット */}
          <svg viewBox="0 0 120 70" className="relative h-28 w-auto text-ink-raised" fill="currentColor">
            <ellipse cx="60" cy="66" rx="46" ry="4" fill="rgba(0,0,0,0.3)" />
            <path d="M60 10c-7 0-12 6-12 13 0 4 2 7 4 9-10 3-17 11-17 22h50c0-11-7-19-17-22 2-2 4-5 4-9 0-7-5-13-12-13z" />
            <rect x="30" y="52" width="60" height="10" rx="2" />
          </svg>
        </div>
        <div className="border-t border-gold/15 bg-ink-raised/80 px-4 py-3 text-center">
          <p className="font-heading text-base font-bold text-gold-soft">AI寺子屋</p>
          <p className="mt-1 text-xs text-parchment-dim">ようこそ寺子屋へ。AIで学び、創り、表現する力を育てましょう。</p>
        </div>
      </div>

      <Card highlight className="mb-4 text-sm leading-relaxed text-parchment">
        受講や作品制作は、国家貢献として記録されます。
        <span className="mt-1 block text-xs text-parchment-dim">
          (現在はUI上の表示のみで、実際のポイント付与は今後対応予定です)
        </span>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <MenuTile icon="📖" label="今日の講義" href={artSchoolUrl} external />
        <MenuTile icon="🖌️" label="作品を作る" href={artSchoolUrl} external />
        <MenuTile icon="🖼️" label="みんなの作品" href="/market" />
        <MenuTile icon="🪙" label="NFTにする" href="/market" />
      </div>

      <div className="mt-8 text-center">
        <Link href="/" className="text-sm text-parchment-dim underline decoration-gold/30 underline-offset-4 transition hover:text-gold-soft">
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}

function MenuTile({
  icon,
  label,
  href,
  external = false,
}: {
  icon: string;
  label: string;
  href: string | null;
  external?: boolean;
}) {
  if (!href) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-gold/10 bg-ink-raised/40 py-5 text-center opacity-50">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-semibold text-parchment">{label}</span>
        <span className="text-[10px] text-parchment-dim">近日公開</span>
      </div>
    );
  }

  const commonClass =
    "flex flex-col items-center gap-1.5 rounded-xl border border-gold/25 bg-ink-raised/70 py-5 text-center transition hover:-translate-y-0.5 hover:border-gold/50 active:scale-95";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={commonClass}>
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-semibold text-parchment">{label}</span>
      </a>
    );
  }

  return (
    <Link href={href} className={commonClass}>
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-semibold text-parchment">{label}</span>
    </Link>
  );
}
