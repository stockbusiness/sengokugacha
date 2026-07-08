"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LinkButton, TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import type { PassportData } from "@/lib/passport";

type Status = "initializing" | "ready" | "error";
type ExternalLink = { key: string; label: string; url: string };

export default function Home() {
  const [status, setStatus] = useState<Status>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);
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

    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs tracking-[0.3em] text-gold/70">SENGOKU ECONOMY OS</p>
        <h1 className="gold-title font-heading mt-1 text-4xl font-bold">戦国パスポート</h1>
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
        <Card highlight ornate className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent" />
          <div className="relative flex items-center justify-between border-b border-gold/15 pb-4">
            <div>
              <p className="text-xs text-parchment-dim">城主名</p>
              <p className="font-heading text-xl font-bold text-parchment">
                {passport.displayName ?? "(未設定)"}
              </p>
            </div>
            <span className="rounded-full border border-gold/50 bg-gradient-to-b from-crimson-soft to-crimson-dark px-3 py-1.5 text-xs font-bold text-gold-soft shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
              ✦ {passport.rank}
            </span>
          </div>

          <dl className="relative mt-4 grid grid-cols-3 gap-3">
            <StatTile icon="🪙" label="石高" value={passport.kokudaka.toLocaleString()} />
            <StatTile icon="⚔️" label="戦功" value={passport.senko.toLocaleString()} />
            <StatTile icon="🎫" label="ガチャ券" value={passport.gachaTickets} />
            <StatTile icon="🪖" label="所持武将" value={passport.warlordCount} />
            <StatTile icon="🗾" label="制圧国数" value={`${passport.conqueredProvinceCount}/66`} />
            <StatTile icon="🏯" label="連続登城" value={`${passport.loginStreak}日`} />
          </dl>
        </Card>
      )}

      {status === "ready" && (
        <div className="mt-6 space-y-2">
          <LinkButton href="/gacha">ガチャを引く</LinkButton>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <TextLink href="/regions">地方コンプ</TextLink>
            <TextLink href="/tenka-toitsu">天下統一</TextLink>
          </div>
        </div>
      )}

      {externalLinks.length > 0 && (
        <div className="mt-8 space-y-2 border-t border-gold/15 pt-6">
          <p className="mb-2 text-center text-xs text-parchment-dim">送客リンク</p>
          {externalLinks.map((link) => (
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
