"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ExternalLinkCard } from "@/components/hubs/ExternalLinkCard";
import { MissionPing } from "@/components/MissionPing";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type Status = "loading" | "ready" | "error";
type ExternalLink = { key: string; label: string; url: string };

export default function MarketPage() {
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
        <p className="text-center text-parchment-dim">読み込み中...</p>
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

  const nftUrl = links.find((l) => l.key === "nft_marketplace")?.url ?? null;
  const eventTicketUrl = links.find((l) => l.key === "event_reservation")?.url ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <MissionPing missionKey="view_market" />
      <PageHeader
        title="戦国市場"
        subtitle="AIで作った作品、NFT、教材、グッズが集まる城下町です。販売や購入は、戦国国家の商業力を高めます。"
      />

      <div className="space-y-3">
        <ExternalLinkCard icon="🎨" title="AI作品" description="AIで制作した作品の展示・販売コーナーです。" url={null} />
        <ExternalLinkCard icon="🖼️" title="NFT" description="戦国経済圏のNFTマーケットプレイスです。" url={nftUrl} />
        <ExternalLinkCard icon="📚" title="教材" description="AI・戦国経済圏に関する教材コーナーです。" url={null} />
        <ExternalLinkCard icon="🎁" title="グッズ" description="戦国パスポート公式グッズコーナーです。" url={null} />
        <ExternalLinkCard
          icon="🎫"
          title="イベントチケット"
          description="各種イベントのチケット予約はこちらから。"
          url={eventTicketUrl}
        />
      </div>

      <div className="mt-8 text-center">
        <TextLink href="/">ホームに戻る</TextLink>
      </div>
    </div>
  );
}
