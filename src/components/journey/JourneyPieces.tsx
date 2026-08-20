"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";

// 「はじまりの旅」の画面で共通して使う小さな部品。
//
// 参加者に年配の方を含むため、指示書§12の要件をここで一箇所に集約している:
// 本文を小さくしすぎない / タップ領域を十分に確保する / 専門用語を避ける /
// 付与待ちをエラーと誤認させない。

export type RewardDisplay =
  | { kind: "hidden" }
  | { kind: "not_eligible" }
  | { kind: "amount"; amount: number };

export type MissionSummary = {
  id: string;
  code: string;
  title: string;
  displayOrder: number;
  status: "not_started" | "in_progress" | "completed";
  available: boolean;
  unavailableReason: string | null;
  reward: RewardDisplay;
};

const STATUS_BADGE: Record<MissionSummary["status"], { label: string; className: string }> = {
  completed: { label: "完了", className: "bg-gold/25 text-gold-soft" },
  in_progress: { label: "とちゅう", className: "bg-crimson/60 text-parchment" },
  not_started: { label: "これから", className: "bg-ink text-parchment-dim" },
};

export function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-base text-parchment">{label}</span>
        <span className="text-base font-bold text-gold-soft">{percent}%</span>
      </div>
      <div
        className="mt-2 h-3 w-full overflow-hidden rounded-full bg-ink"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-gold-soft/80 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// 獲得予定の表示。付与機能OFFのときは何も出さない。付与対象外は「0」ではなく
// 対象外である旨を示す(指示書§4.1)。
export function RewardBadge({ reward }: { reward: RewardDisplay }) {
  if (reward.kind === "hidden") return null;
  if (reward.kind === "not_eligible") {
    return <span className="text-sm text-parchment-dim">特典の対象外です</span>;
  }
  return <span className="text-sm text-gold-soft">獲得予定 {reward.amount.toLocaleString()}</span>;
}

export function MissionCard({ mission, index }: { mission: MissionSummary; index: number }) {
  const badge = STATUS_BADGE[mission.status];

  // 未解放のミッションはリンクにしない(押しても開けないため)。
  const inner = (
    <Card
      className={`transition ${mission.available ? "hover:border-gold/50 hover:bg-ink-raised" : "opacity-60"}`}
      highlight={mission.status === "completed"}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-ink text-xl font-bold text-gold-soft">
          {mission.status === "completed" ? "✓" : index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold leading-snug text-parchment">{mission.title}</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <RewardBadge reward={mission.reward} />
            {!mission.available && mission.unavailableReason && (
              <span className="text-sm text-parchment-dim">{mission.unavailableReason}</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );

  if (!mission.available) return inner;
  // タップ領域を十分に取るため、カード全体をリンクにする。
  return (
    <Link href={`/journey/missions/${mission.id}`} className="block">
      {inner}
    </Link>
  );
}

export function JourneyClosedNotice() {
  return (
    <Card className="text-center">
      <p className="text-lg text-parchment">ただいま準備中です</p>
      <p className="mt-2 text-base leading-relaxed text-parchment-dim">
        「はじまりの旅」は現在ご利用いただけません。公開までしばらくお待ちください。
      </p>
    </Card>
  );
}
