"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

// 「はじまりの旅」への入口カード。
//
// ADR-2: BottomNavは5枠が埋まっているため変更せず、ホームとSideMenuに入口を置く。
// 機能フラグがOFF、または公開中のコースが無い間は何も描画しない
// (存在しない機能の入口を見せない)。
export function JourneyEntryCard() {
  const [visible, setVisible] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/journey")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled: boolean; enrolled: boolean } | null) => {
        if (cancelled || !data) return;
        setVisible(data.enabled);
        setEnrolled(data.enrolled);
      })
      .catch(() => {
        /* 取得に失敗したら入口を出さない(ホーム全体の表示は妨げない) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <Link href="/journey" className="block">
      <Card highlight className="transition hover:border-gold/50 hover:bg-ink-raised">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧭</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-parchment">はじまりの旅</p>
            <p className="mt-0.5 text-xs text-parchment-dim">
              千ノ国のことを知り、体験しながら、自分に合った関わり方を見つけます。
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-gold-soft">
            {enrolled ? "つづきへ →" : "はじめる →"}
          </span>
        </div>
      </Card>
    </Link>
  );
}
