"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import type { ProvinceProgress, ProvinceProgressSummary } from "@/lib/provinces";

type Status = "loading" | "ready" | "error";

const REGION_ORDER = ["東北", "関東", "中部", "近畿", "中国", "四国", "九州", "北陸"];

export default function MapPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [summary, setSummary] = useState<ProvinceProgressSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const session = await ensureLiffSession();
        if (session.status === "redirecting") return;

        const res = await fetch("/api/map");
        if (!res.ok) throw new Error("進捗の取得に失敗しました。");
        const data: ProvinceProgressSummary = await res.json();
        if (cancelled) return;
        setSummary(data);
        setStatus("ready");
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

  const nonFinalProvinces = summary?.provinces.filter((p) => !p.isFinalProvince) ?? [];
  const mino = summary?.provinces.find((p) => p.isFinalProvince) ?? null;

  const regionGroups = REGION_ORDER.map((region) => ({
    region,
    provinces: nonFinalProvinces.filter((p) => p.region === region),
  })).filter((g) => g.provinces.length > 0);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader
        title="日本地図"
        subtitle={
          status === "ready" && summary ? `制圧国数: ${summary.conqueredCount} / 66` : undefined
        }
      />

      {status === "loading" && <p className="text-center text-parchment-dim">読み込み中...</p>}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
          {errorMessage}
        </Card>
      )}

      {status === "ready" && (
        <div className="space-y-4">
          {regionGroups.map((group) => (
            <Card key={group.region}>
              <h2 className="mb-3 text-sm font-semibold text-gold-soft">{group.region}地方</h2>
              <div className="flex flex-wrap gap-2">
                {group.provinces.map((p) => (
                  <ProvinceTile key={p.id} province={p} />
                ))}
              </div>
            </Card>
          ))}

          {mino && (
            <Card highlight>
              <h2 className="mb-3 text-sm font-semibold text-gold-soft">最終国</h2>
              <MinoTile province={mino} conqueredCount={summary?.conqueredCount ?? 0} />
            </Card>
          )}
        </div>
      )}

      <div className="mt-8 border-t border-gold/15 pt-6">
        <TextLink href="/regions">地方コンプ状況を見る</TextLink>
      </div>
    </div>
  );
}

function ProvinceTile({ province }: { province: ProvinceProgress }) {
  return (
    <span
      className={
        "rounded-full px-3 py-1.5 text-sm font-medium " +
        (province.isConquered
          ? "border border-gold/50 bg-gold/15 text-gold-soft"
          : "border border-gold/10 bg-ink text-parchment-dim/50")
      }
    >
      {province.isConquered ? "✓ " : ""}
      {province.name}
    </span>
  );
}

function MinoTile({ province, conqueredCount }: { province: ProvinceProgress; conqueredCount: number }) {
  const threshold = province.unlockConditionCount;
  const unlocked = threshold == null || conqueredCount >= threshold;

  if (province.isConquered) {
    return (
      <span className="rounded-full border border-gold/50 bg-gold/15 px-3 py-1.5 text-sm font-medium text-gold-soft">
        ✓ {province.name}(天下統一達成)
      </span>
    );
  }

  if (unlocked) {
    return (
      <span className="rounded-full border border-crimson/60 bg-crimson-soft/50 px-3 py-1.5 text-sm font-medium text-parchment">
        挑戦可能: {province.name}
      </span>
    );
  }

  const remaining = threshold != null ? Math.max(threshold - conqueredCount, 0) : null;
  return (
    <span className="rounded-full border border-gold/10 bg-ink px-3 py-1.5 text-sm font-medium text-parchment-dim/50">
      🔒 {province.name}
      {remaining != null ? `(あと${remaining}国)` : ""}
    </span>
  );
}
