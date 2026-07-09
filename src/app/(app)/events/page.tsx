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

export default function EventsPage() {
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

  const artSchoolUrl = links.find((l) => l.key === "ai_art_school")?.url ?? null;
  const eventReservationUrl = links.find((l) => l.key === "event_reservation")?.url ?? null;
  const nationBuilderUrl = links.find((l) => l.key === "nation_builder_program")?.url ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <MissionPing missionKey="view_events" />
      <PageHeader title="イベント" subtitle="オンライン説明会、AIアート教室、国家会議、リアルイベントへの入口です。" />

      <div className="space-y-3">
        <ExternalLinkCard icon="🎨" title="AIアート教室" description="定期開催のAIアート教室です。" url={artSchoolUrl} />
        <ExternalLinkCard
          icon="🏯"
          title="建国メンバー説明会"
          description="建国メンバー制度の詳細をご案内するオンライン説明会です。"
          url={nationBuilderUrl}
        />
        <ExternalLinkCard
          icon="⛩️"
          title="創設メンバー向け国家建設会議"
          description="創設メンバー限定の国家建設の進捗共有会です。"
          url={null}
        />
        <ExternalLinkCard icon="💻" title="オンライン勉強会" description="AI・戦国経済圏に関する勉強会です。" url={null} />
        <ExternalLinkCard icon="🎪" title="リアルイベント" description="オフラインで開催するイベントです。" url={eventReservationUrl} />
        <ExternalLinkCard
          icon="🗾"
          title="メタバース進捗報告会"
          description="メタバース実装の進捗をご報告する会です。"
          url={null}
        />
      </div>

      <div className="mt-8 text-center">
        <TextLink href="/">ホームに戻る</TextLink>
      </div>
    </div>
  );
}
