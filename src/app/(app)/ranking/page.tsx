"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { RANKING_TYPE_LABELS, type RankingEntry, type RankingType } from "@/lib/rankings";

type Status = "loading" | "ready" | "error";

const TYPES: RankingType[] = ["contribution", "warlord_collection", "province_conquest", "academy"];

const VALUE_UNIT: Record<RankingType, string> = {
  contribution: "pt",
  warlord_collection: "体",
  province_conquest: "国",
  academy: "回",
};

export default function RankingPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<RankingType>("contribution");
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(true);

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

    fetch(`/api/rankings?type=${activeType}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RankingEntry[]) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRanking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, activeType]);

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

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="国家ランキング" subtitle="表示のみ。報酬付与は行いません。" />

      <div className="grid grid-cols-2 gap-2">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setLoadingRanking(true);
              setActiveType(type);
            }}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              activeType === type
                ? "border-gold/60 bg-ink-raised text-gold-soft"
                : "border-gold/15 text-parchment-dim hover:border-gold/40"
            }`}
          >
            {RANKING_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loadingRanking && <LoadingSpinner />}

        {!loadingRanking && entries.length === 0 && (
          <p className="text-center text-parchment-dim">ランキングデータがありません。</p>
        )}

        {!loadingRanking && entries.length > 0 && (
          <Card>
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.rank} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-6 text-right font-heading font-bold text-gold-soft">{entry.rank}</span>
                    <span className="text-parchment">{entry.displayName ?? "(未設定)"}</span>
                  </span>
                  <span className="font-semibold text-gold-soft">
                    {entry.value.toLocaleString()}
                    {VALUE_UNIT[activeType]}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="mt-8 text-center">
        <TextLink href="/">ホームに戻る</TextLink>
      </div>
    </div>
  );
}
