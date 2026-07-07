"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type CollectionWarlord = {
  id: string;
  name: string;
  rarity: string;
  slotType: "common" | "mid" | "rare";
  lore: string | null;
  owned: boolean;
  count: number;
};

type CollectionProvince = {
  id: string;
  name: string;
  region: string;
  isFinalProvince: boolean;
  warlords: CollectionWarlord[];
};

const REGION_ORDER = ["東北", "関東", "中部", "近畿", "中国", "四国", "九州", "北陸"];

export default function CollectionPage() {
  const [provinces, setProvinces] = useState<CollectionProvince[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/collection")
          .then((res) => res.json())
          .then((data) => {
            if (cancelled) return;
            setProvinces(data);
            setStatus("ready");
          });
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : null);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const ownedCount = provinces.flatMap((p) => p.warlords).filter((w) => w.owned).length;
  const totalCount = provinces.flatMap((p) => p.warlords).length;

  const nonFinal = provinces.filter((p) => !p.isFinalProvince);
  const mino = provinces.find((p) => p.isFinalProvince) ?? null;

  const regionGroups = REGION_ORDER.map((region) => ({
    region,
    provinces: nonFinal.filter((p) => p.region === region),
  })).filter((g) => g.provinces.length > 0);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-2xl">
        <h1 className="mb-2 text-center text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          図鑑
        </h1>

        {status === "ready" && (
          <p className="mb-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            所持武将: {ownedCount} / {totalCount}
          </p>
        )}

        {status === "loading" && <p className="text-center text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
        {status === "error" && (
          <p className="text-center text-sm text-red-700 dark:text-red-400">
            {errorMessage ?? "読み込みに失敗しました。"}
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
                <div className="space-y-3">
                  {group.provinces.map((p) => (
                    <div key={p.id}>
                      <p className="mb-1 text-xs font-medium text-zinc-400">{p.name}国</p>
                      <div className="flex flex-wrap gap-2">
                        {p.warlords.map((w) => (
                          <WarlordTile key={w.id} warlord={w} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {mino && (
              <section className="rounded-xl border-2 border-red-700 bg-white p-4 dark:bg-zinc-950">
                <h2 className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400">{mino.name}国(最終国)</h2>
                <div className="flex flex-wrap gap-2">
                  {mino.warlords.map((w) => (
                    <WarlordTile key={w.id} warlord={w} />
                  ))}
                </div>
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

function WarlordTile({ warlord }: { warlord: CollectionWarlord }) {
  if (!warlord.owned) {
    return (
      <span className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600">
        ???
      </span>
    );
  }

  return (
    <span className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
      <span className="font-semibold text-zinc-900 dark:text-zinc-50">{warlord.name}</span>
      <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
        {warlord.rarity}
        {warlord.count > 1 ? ` ×${warlord.count}` : ""}
      </span>
    </span>
  );
}
