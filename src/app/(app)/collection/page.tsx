"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader
        title="図鑑"
        subtitle={status === "ready" ? `所持武将: ${ownedCount} / ${totalCount}` : undefined}
      />

      {status === "loading" && <p className="text-center text-parchment-dim">読み込み中...</p>}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
          {errorMessage ?? "読み込みに失敗しました。"}
        </Card>
      )}

      {status === "ready" && (
        <div className="space-y-4">
          {regionGroups.map((group) => (
            <Card key={group.region}>
              <h2 className="mb-3 text-sm font-semibold text-gold-soft">{group.region}地方</h2>
              <div className="space-y-3">
                {group.provinces.map((p) => (
                  <div key={p.id}>
                    <p className="mb-1 text-xs font-medium text-parchment-dim">{p.name}国</p>
                    <div className="flex flex-wrap gap-2">
                      {p.warlords.map((w) => (
                        <WarlordTile key={w.id} warlord={w} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {mino && (
            <Card highlight>
              <h2 className="mb-3 text-sm font-semibold text-gold-soft">{mino.name}国(最終国)</h2>
              <div className="flex flex-wrap gap-2">
                {mino.warlords.map((w) => (
                  <WarlordTile key={w.id} warlord={w} />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function WarlordTile({ warlord }: { warlord: CollectionWarlord }) {
  if (!warlord.owned) {
    return (
      <span className="rounded-lg border border-gold/10 bg-ink px-3 py-2 text-sm text-parchment-dim/50">
        ???
      </span>
    );
  }

  return (
    <span className="rounded-lg border border-gold/25 bg-ink px-3 py-2 text-sm">
      <span className="font-semibold text-parchment">{warlord.name}</span>
      <span className="ml-1 text-xs text-gold-soft">
        {warlord.rarity}
        {warlord.count > 1 ? ` ×${warlord.count}` : ""}
      </span>
    </span>
  );
}
