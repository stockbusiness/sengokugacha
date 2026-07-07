"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
    <div className="min-h-screen bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-2xl">
        <h1 className="mb-2 text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          日本地図(国盗り進捗)
        </h1>

        {status === "ready" && summary && (
          <p className="mb-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            制圧国数: {summary.conqueredCount} / 66
          </p>
        )}

        {status === "loading" && (
          <p className="text-center text-zinc-500 dark:text-zinc-400">読み込み中...</p>
        )}

        {status === "error" && (
          <p className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </p>
        )}

        {status === "ready" && (
          <div className="space-y-6">
            {regionGroups.map((group) => (
              <section
                key={group.region}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{group.region}地方</h2>
                <div className="flex flex-wrap gap-2">
                  {group.provinces.map((p) => (
                    <ProvinceTile key={p.id} province={p} />
                  ))}
                </div>
              </section>
            ))}

            {mino && (
              <section className="rounded-xl border-2 border-red-700 bg-white p-4 dark:bg-zinc-950">
                <h2 className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400">最終国</h2>
                <MinoTile province={mino} conqueredCount={summary?.conqueredCount ?? 0} />
              </section>
            )}
          </div>
        )}

        <Link
          href="/"
          className="mt-8 block text-center text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          戦国パスポートに戻る
        </Link>
      </main>
    </div>
  );
}

function ProvinceTile({ province }: { province: ProvinceProgress }) {
  return (
    <span
      className={
        "rounded-full px-3 py-1.5 text-sm font-medium " +
        (province.isConquered
          ? "bg-emerald-600 text-white"
          : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500")
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
      <span className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">
        ✓ {province.name}(天下統一達成)
      </span>
    );
  }

  if (unlocked) {
    return (
      <span className="rounded-full bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">
        挑戦可能: {province.name}
      </span>
    );
  }

  const remaining = threshold != null ? Math.max(threshold - conqueredCount, 0) : null;
  return (
    <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
      🔒 {province.name}
      {remaining != null ? `(あと${remaining}国)` : ""}
    </span>
  );
}
