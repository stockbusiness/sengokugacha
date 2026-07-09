"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { NationBuilderOfferCard } from "@/components/founding-member/NationBuilderOfferCard";
import { MissionPing } from "@/components/MissionPing";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import type { PassportData } from "@/lib/passport";

type Status = "loading" | "ready" | "error";
type ExternalLink = { key: string; label: string; url: string };

// Ver2.2指示書7章: 「将来メタバースができるから買う」ではなく、
// 「今日からAI・販売・コミュニティ・特典を使えるから参加する」という説明にする。
const TODAY_VALUES = [
  { icon: "📜", title: "AI寺子屋プレミアム", body: "AI寺子屋のプレミアム講座を優先受講できます。" },
  { icon: "🎴", title: "武将登用の優遇", body: "武将登用(ガチャ)で優遇を受けられます。" },
  { icon: "🏮", title: "マーケット販売支援", body: "戦国市場での作品・NFT販売をサポートします。" },
];

const FUTURE_VALUES = [
  { icon: "🏯", title: "国家会議への参加権", body: "戦国国家の意思決定に関わる国家会議にご案内します。" },
  { icon: "🖼️", title: "限定NFT", body: "建国メンバー限定のNFTを優先的にご案内します。" },
  { icon: "🗾", title: "メタバース優先特典", body: "将来のメタバース実装時、優先的な特典を受けられます。" },
];

export default function NationBuilderPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [links, setLinks] = useState<ExternalLink[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const session = await ensureLiffSession();
        if (session.status === "redirecting") return;

        const meRes = await fetch("/api/me");
        if (meRes.ok) {
          const data: PassportData = await meRes.json();
          if (!cancelled) setPassport(data);
        }

        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
        setStatus("error");
      }
    }

    run();
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

  const nationBuilderUrl = links.find((l) => l.key === "nation_builder_program")?.url ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <MissionPing missionKey="view_nation_builder_info" />
      <PageHeader title="建国メンバー制度" subtitle="AIを学び、作品を作り、戦国経済圏の中で販売・発信する中核メンバー" />

      <Card highlight className="mb-6 text-center text-sm leading-relaxed text-parchment">
        「将来メタバースができるから」ではありません。
        <br />
        今日から、AI・販売・コミュニティ・特典を使えるから参加する制度です。
      </Card>

      <p className="mb-2 text-xs tracking-[0.2em] text-gold/70">今日から受け取れる価値</p>
      <div className="space-y-3">
        {TODAY_VALUES.map((v) => (
          <Card key={v.title}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">{v.icon}</span>
              <div>
                <p className="text-sm font-bold text-gold-soft">{v.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-parchment">{v.body}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="mb-2 mt-6 text-xs tracking-[0.2em] text-gold/70">将来広がる価値</p>
      <div className="space-y-3">
        {FUTURE_VALUES.map((v) => (
          <Card key={v.title}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">{v.icon}</span>
              <div>
                <p className="text-sm font-bold text-gold-soft">{v.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-parchment">{v.body}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <NationBuilderOfferCard
          isFoundingMember={passport?.isFoundingMember ?? false}
          href={nationBuilderUrl}
          external
          ctaLabel="説明会を予約する →"
        />
      </div>

      <div className="mt-6 text-center">
        <TextLink href="/founding-member">創設メンバー制度について →</TextLink>
      </div>

      <div className="mt-8 text-center">
        <TextLink href="/">ホームに戻る</TextLink>
      </div>
    </div>
  );
}
