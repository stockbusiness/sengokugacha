"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { MissionPing } from "@/components/MissionPing";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { toDisplayUrl } from "@/lib/image-url";

type CollectionWarlord = {
  id: string;
  name: string;
  rarity: string;
  slotType: "common" | "mid" | "rare";
  imageUrl: string | null;
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

type SlotType = "common" | "mid" | "rare";
const TIER_ORDER: SlotType[] = ["rare", "mid", "common"];
// 画面デザインガイドのレアリティ色分け(SSR=金/SR=紫/N=グレー)を、既存の3段階スロット
// (common/mid/rare)にマッピングしたもの。
const TIER_STYLE: Record<SlotType, { border: string; text: string; chip: string }> = {
  rare: { border: "border-gold/60", text: "text-gold-soft", chip: "border-gold/50 text-gold-soft" },
  mid: { border: "border-purple/60", text: "text-purple", chip: "border-purple/50 text-purple" },
  common: {
    border: "border-parchment-dim/25",
    text: "text-parchment-dim",
    chip: "border-parchment-dim/30 text-parchment-dim",
  },
};

export default function CollectionPage() {
  const [provinces, setProvinces] = useState<CollectionProvince[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<SlotType | "all">("all");

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

  const allWarlords = provinces.flatMap((p) => p.warlords);
  const tierLabels = TIER_ORDER.map((tier) => ({
    tier,
    label: allWarlords.find((w) => w.slotType === tier)?.rarity ?? tier,
  })).filter((t) => allWarlords.some((w) => w.slotType === t.tier));

  function matchesFilter(w: CollectionWarlord) {
    return tierFilter === "all" || w.slotType === tierFilter;
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader
        title="図鑑"
        subtitle={status === "ready" ? `所持武将: ${ownedCount} / ${totalCount}` : undefined}
      />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
          {errorMessage ?? "読み込みに失敗しました。"}
        </Card>
      )}

      {status === "ready" && (
        <div className="space-y-4">
          <MissionPing missionKey="view_collection" />

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTierFilter("all")}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                tierFilter === "all" ? "border-gold/70 bg-ink-raised text-gold-soft" : "border-gold/15 text-parchment-dim"
              }`}
            >
              すべて
            </button>
            {tierLabels.map(({ tier, label }) => (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  tierFilter === tier ? `${TIER_STYLE[tier].chip} bg-ink-raised` : "border-gold/15 text-parchment-dim"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {regionGroups.map((group) => (
            <Card key={group.region} ornate>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-gold-soft">{group.region}地方</h2>
              <div className="space-y-4">
                {group.provinces.map((p) => {
                  const visibleWarlords = p.warlords.filter(matchesFilter);
                  if (visibleWarlords.length === 0) return null;
                  return (
                    <div key={p.id}>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-parchment-dim">
                        <span className="text-gold/70">◆</span>
                        {p.name}国
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {visibleWarlords.map((w) => (
                          <WarlordCard key={w.id} warlord={w} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          {mino && mino.warlords.some(matchesFilter) && (
            <Card highlight ornate>
              <h2 className="mb-3 text-sm font-semibold tracking-wide text-gold-soft">{mino.name}国(最終国)</h2>
              <div className="grid grid-cols-3 gap-2">
                {mino.warlords.filter(matchesFilter).map((w) => (
                  <WarlordCard key={w.id} warlord={w} />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// 巻物風カード。上下に軸(巻物の芯)を表す金の帯を置き、タップで少し浮き上がる。
function ScrollCardFrame({ children, borderClass }: { children: React.ReactNode; borderClass: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg border ${borderClass}`}>
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-gold/10 via-gold/70 to-gold/10" />
      {children}
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gradient-to-r from-gold/10 via-gold/70 to-gold/10" />
    </div>
  );
}

function WarlordCard({ warlord }: { warlord: CollectionWarlord }) {
  if (!warlord.owned) {
    return (
      <ScrollCardFrame borderClass="border-gold/10">
        <div
          className="flex aspect-[4/3] items-center justify-center bg-gradient-to-b from-ink-raised/60 to-ink text-sm tracking-wide text-parchment-dim/40"
          aria-label="未獲得武将"
        >
          ???
        </div>
      </ScrollCardFrame>
    );
  }

  const tier = TIER_STYLE[warlord.slotType];

  return (
    <ScrollCardFrame borderClass={`${tier.border} shadow-[inset_0_0_0_1px_rgba(232,205,122,0.08)]`}>
      <div className="group relative aspect-[4/3] cursor-default transition-transform duration-200 will-change-transform hover:-translate-y-1 active:-translate-y-0.5 active:scale-[0.98]">
        {warlord.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toDisplayUrl(warlord.imageUrl) ?? undefined}
            alt={warlord.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-crimson-soft/40 to-ink text-center">
            <span aria-hidden="true" className="text-xl drop-shadow-[0_0_8px_rgba(232,205,122,0.3)]">
              ⚔️
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/95 via-ink/60 to-transparent px-1.5 pb-1.5 pt-4 text-center">
          <p className="line-clamp-1 text-[11px] font-semibold text-parchment">{warlord.name}</p>
          <p className={`text-[10px] ${tier.text}`}>
            {warlord.rarity}
            {warlord.count > 1 ? ` ×${warlord.count}` : ""}
          </p>
        </div>
      </div>
    </ScrollCardFrame>
  );
}
