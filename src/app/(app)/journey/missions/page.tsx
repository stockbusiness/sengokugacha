"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { JourneyClosedNotice, MissionCard, ProgressBar, type MissionSummary } from "@/components/journey/JourneyPieces";

type Overview = {
  enabled: boolean;
  progress: { totalMissions: number; completedMissions: number; ratio: number } | null;
  missions: MissionSummary[];
};

export default function JourneyMissionsPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/journey")
          .then((res) => {
            if (!res.ok) throw new Error("読み込みに失敗しました。");
            return res.json();
          })
          .then((data: Overview) => {
            if (cancelled) return;
            setOverview(data);
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
      <PageHeader title="ミッション一覧" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-base text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && overview && !overview.enabled && <JourneyClosedNotice />}

      {status === "ready" && overview?.enabled && (
        <div className="space-y-5">
          {overview.progress && (
            <Card>
              <ProgressBar
                ratio={overview.progress.ratio}
                label={`${overview.progress.totalMissions}つのうち ${overview.progress.completedMissions}つ完了`}
              />
            </Card>
          )}

          <div className="space-y-3">
            {overview.missions.map((mission, index) => (
              <MissionCard key={mission.id} mission={mission} index={index + 1} />
            ))}
          </div>

          {overview.missions.length === 0 && (
            <Card className="text-center text-base text-parchment-dim">まだミッションがありません。</Card>
          )}
        </div>
      )}

      <div className="pt-6">
        <TextLink href="/journey">← はじまりの旅に戻る</TextLink>
      </div>
    </div>
  );
}
