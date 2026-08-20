"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { JourneyClosedNotice, MissionCard, ProgressBar, type MissionSummary } from "@/components/journey/JourneyPieces";

type RewardRow = { missionTitle: string; amount: number; status: string; completedAt: string };

type ProgressDetail = {
  enabled: boolean;
  rewardsEnabled: boolean;
  missions: MissionSummary[];
  progress: { totalMissions: number; completedMissions: number; ratio: number } | null;
  rewards: RewardRow[];
};

// 指示書§8.3「利用者画面では『ミッション完了』と『OVE付与済み』を別表示し、
// Wallet障害時に再受講を要求しない」。§12「付与待ちをエラーや失敗と誤認させない」。
const REWARD_STATUS_LABEL: Record<string, string> = {
  PENDING: "お手続き中",
  PROCESSING: "お手続き中",
  FAILED: "お手続き中",
  LIMIT_HELD: "お手続き中",
  SUCCEEDED: "お受け取り済み",
  CANCELLED: "取り消し済み",
  REVERSED: "取り消し済み",
};

export default function JourneyProgressPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProgressDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/journey/progress")
          .then((res) => {
            if (!res.ok) throw new Error("読み込みに失敗しました。");
            return res.json();
          })
          .then((data: ProgressDetail) => {
            if (cancelled) return;
            setDetail(data);
            setStatus("ready");
          });
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

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="これまでの記録" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-base text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && detail && !detail.enabled && <JourneyClosedNotice />}

      {status === "ready" && detail?.enabled && (
        <div className="space-y-5">
          {detail.progress && (
            <Card>
              <ProgressBar
                ratio={detail.progress.ratio}
                label={`${detail.progress.totalMissions}つのうち ${detail.progress.completedMissions}つ完了`}
              />
            </Card>
          )}

          <div className="space-y-3">
            <h2 className="text-base font-bold text-gold-soft">ミッションの状況</h2>
            {detail.missions.map((mission, index) => (
              <MissionCard key={mission.id} mission={mission} index={index + 1} />
            ))}
          </div>

          {/* 付与機能がOFFの間は特典欄自体を出さない(もらえるはずなのに来ない、という誤解を防ぐ) */}
          {detail.rewardsEnabled && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-gold-soft">特典の状況</h2>
              {detail.rewards.length === 0 ? (
                <Card className="text-base text-parchment-dim">まだ特典の記録はありません。</Card>
              ) : (
                detail.rewards.map((reward, index) => (
                  <Card key={`${reward.missionTitle}-${index}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base leading-snug text-parchment">{reward.missionTitle}</p>
                        <p className="mt-1 text-sm text-parchment-dim">
                          {new Date(reward.completedAt).toLocaleDateString("ja-JP")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-gold-soft">{reward.amount.toLocaleString()}</p>
                        <p className="text-sm text-parchment-dim">
                          {REWARD_STATUS_LABEL[reward.status] ?? "お手続き中"}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="pt-6">
        <TextLink href="/journey">← はじまりの旅に戻る</TextLink>
      </div>
    </div>
  );
}
