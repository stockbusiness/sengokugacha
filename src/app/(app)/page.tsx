"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LinkButton, TextLink } from "@/components/ui/Button";
import { DailyMissionsCard } from "@/components/dashboard/DailyMissionsCard";
import { NationalIdCard } from "@/components/dashboard/NationalIdCard";
import { NationBuildingRateCard } from "@/components/dashboard/NationBuildingRateCard";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import type { DailyMissionStatus } from "@/lib/daily-missions";
import type { PassportData } from "@/lib/passport";

type Status = "initializing" | "ready" | "error";
type ExternalLink = { key: string; label: string; url: string };

// AI寺子屋・マーケットは国家ダッシュボードの主要導線として常に枠を表示する
// (既存の外部送客リンク管理(external_links)のURLをそのまま利用する)。
const FEATURED_LINK_OVERRIDES: Record<string, { label: string; icon: string }> = {
  ai_art_school: { label: "AI寺子屋", icon: "📜" },
  nft_marketplace: { label: "マーケット", icon: "🏮" },
};

function pingMission(key: string) {
  fetch("/api/missions/ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  }).catch(() => {
    /* 任務達成表示はおまけ機能のため、失敗しても無視する */
  });
}

export default function Home() {
  const [status, setStatus] = useState<Status>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [missions, setMissions] = useState<DailyMissionStatus[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const session = await ensureLiffSession();
        if (session.status === "redirecting") return;

        const meRes = await fetch("/api/me");
        if (!meRes.ok) {
          throw new Error("パスポート情報の取得に失敗しました。");
        }

        const data: PassportData = await meRes.json();
        if (cancelled) return;
        setPassport(data);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setErrorMessage(
          error instanceof Error ? error.message : "予期しないエラーが発生しました。"
        );
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
        if (!cancelled) setExternalLinks(data);
      })
      .catch(() => {
        /* 送客導線はおまけ機能のため、取得失敗してもパスポート表示自体は継続する */
      });

    fetch("/api/missions")
      .then((res) => (res.ok ? res.json() : { missions: [] }))
      .then((data: { missions: DailyMissionStatus[] }) => {
        if (!cancelled) setMissions(data.missions ?? []);
      })
      .catch(() => {
        /* 本日の任務もおまけ機能のため、取得失敗してもパスポート表示自体は継続する */
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  const featuredLinks = externalLinks.filter((link) => link.key in FEATURED_LINK_OVERRIDES);
  const otherLinks = externalLinks.filter((link) => !(link.key in FEATURED_LINK_OVERRIDES));

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs tracking-[0.3em] text-gold/70">SENGOKU ECONOMY OS</p>
        <h1 className="gold-title font-heading mt-1 text-4xl font-bold">戦国パスポート</h1>
        <p className="mt-1 text-[11px] tracking-[0.15em] text-parchment-dim">国家ダッシュボード</p>
        <div className="mx-auto mt-3 h-px w-16 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
      </div>

      {status === "initializing" && (
        <p className="text-center text-parchment-dim">読み込み中...</p>
      )}

      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
          {errorMessage}
        </Card>
      )}

      {status === "ready" && passport && (
        <div className="space-y-4">
          <NationalIdCard passport={passport} />
          <NationBuildingRateCard rate={passport.nationBuildingRate} />
          <DailyMissionsCard missions={missions} />

          <Card>
            <dl className="grid grid-cols-3 gap-3">
              <StatTile icon="🪙" label="石高" value={passport.kokudaka.toLocaleString()} />
              <StatTile icon="⚔️" label="戦功" value={passport.senko.toLocaleString()} />
              <StatTile icon="🎫" label="ガチャ券" value={passport.gachaTickets} />
              <StatTile icon="🪖" label="所持武将" value={passport.warlordCount} />
              <StatTile
                icon="🗾"
                label="制圧国数"
                value={`${passport.conqueredProvinceCount}/${passport.totalProvinceCount}`}
              />
              <StatTile icon="🏯" label="連続登城" value={`${passport.loginStreak}日`} />
            </dl>
          </Card>

          <div className="space-y-2">
            <LinkButton href="/gacha">武将登用を行う</LinkButton>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <TextLink href="/regions">地方コンプ</TextLink>
              <TextLink href="/tenka-toitsu">天下統一</TextLink>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {Object.entries(FEATURED_LINK_OVERRIDES).map(([key, meta]) => {
              const link = featuredLinks.find((l) => l.key === key);
              if (!link) {
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-gold/10 px-3 py-4 text-center text-xs text-parchment-dim/60"
                  >
                    <p className="text-lg">{meta.icon}</p>
                    <p className="mt-1">{meta.label}(準備中)</p>
                  </div>
                );
              }
              return (
                <a
                  key={key}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => key === "ai_art_school" && pingMission("view_terakoya")}
                  className="rounded-lg border border-gold/25 px-3 py-4 text-center text-xs font-semibold text-gold-soft transition hover:border-gold/50 hover:bg-ink-raised"
                >
                  <p className="text-lg">{meta.icon}</p>
                  <p className="mt-1">{meta.label} ↗</p>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {otherLinks.length > 0 && (
        <div className="mt-8 space-y-2 border-t border-gold/15 pt-6">
          <p className="mb-2 text-center text-xs text-parchment-dim">送客リンク</p>
          {otherLinks.map((link) => (
            <a
              key={link.key}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-gold/25 px-4 py-3 text-center text-sm font-semibold text-gold-soft transition hover:border-gold/50 hover:bg-ink-raised"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="relative rounded-xl border border-gold/15 bg-gradient-to-b from-ink-raised to-ink px-2 py-3 text-center shadow-[inset_0_0_16px_rgba(232,205,122,0.03)]">
      <p aria-hidden="true" className="text-xl leading-none drop-shadow-[0_0_6px_rgba(201,162,39,0.25)]">
        {icon}
      </p>
      <p className="mt-1.5 text-[11px] tracking-wide text-parchment-dim">{label}</p>
      <p className="mt-1 text-base font-bold tabular-nums text-gold-soft">{value}</p>
    </div>
  );
}
