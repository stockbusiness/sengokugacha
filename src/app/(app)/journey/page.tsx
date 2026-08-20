"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, LinkButton, TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import {
  JourneyClosedNotice,
  MissionCard,
  ProgressBar,
  type MissionSummary,
} from "@/components/journey/JourneyPieces";

type Overview = {
  enabled: boolean;
  course: { id: string; title: string; description: string | null } | null;
  enrolled: boolean;
  progress: { totalMissions: number; completedMissions: number; ratio: number; nextMissionId: string | null; allCompleted: boolean } | null;
  missions: MissionSummary[];
  resume: { canResume: boolean; rewardEligible: boolean; elapsedDays: number } | null;
};

export default function JourneyTopPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  function load() {
    return fetch("/api/journey")
      .then((res) => {
        if (!res.ok) throw new Error("読み込みに失敗しました。");
        return res.json();
      })
      .then((data: Overview) => {
        setOverview(data);
        setStatus("ready");
      });
  }

  useEffect(() => {
    let cancelled = false;
    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return load();
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

  async function handleStart() {
    setEnrolling(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/journey/enroll", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "はじめられませんでした。");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "はじめられませんでした。");
    } finally {
      setEnrolling(false);
    }
  }

  const next = overview?.missions.find((mission) => mission.id === overview.progress?.nextMissionId) ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-base text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && overview && !overview.enabled && (
        <>
          <PageHeader title="はじまりの旅" />
          <JourneyClosedNotice />
          <div className="pt-6">
            <TextLink href="/">← ホームに戻る</TextLink>
          </div>
        </>
      )}

      {status === "ready" && overview?.enabled && overview.course && (
        <div className="space-y-5">
          <PageHeader title="はじまりの旅" subtitle={overview.course.title} />

          {overview.course.description && (
            <Card className="text-base leading-relaxed text-parchment-dim">{overview.course.description}</Card>
          )}

          {!overview.enrolled ? (
            <Card className="space-y-4 text-center">
              <p className="text-base leading-relaxed text-parchment">
                千ノ国のことを知り、体験しながら、自分に合った関わり方を見つけていく旅です。
                とちゅうでやめても、あとから続けられます。
              </p>
              <Button onClick={handleStart} disabled={enrolling}>
                {enrolling ? "準備しています..." : "はじめる"}
              </Button>
              {errorMessage && <p className="text-base text-crimson-dark">{errorMessage}</p>}
            </Card>
          ) : (
            <>
              {overview.progress && (
                <Card>
                  <ProgressBar
                    ratio={overview.progress.ratio}
                    label={`${overview.progress.totalMissions}つのうち ${overview.progress.completedMissions}つ完了`}
                  />
                </Card>
              )}

              {/* 再開期限と特典の対象期間は別設定。対象外になる場合は再開前に伝える(指示書§4.1) */}
              {overview.resume && !overview.resume.rewardEligible && (
                <Card className="border-gold/40 text-base leading-relaxed text-parchment-dim">
                  はじめてから{overview.resume.elapsedDays}日が経ちました。
                  続きはご覧いただけますが、特典のお受け取り期間は過ぎています。
                </Card>
              )}

              {next ? (
                <Card highlight className="space-y-4">
                  <div>
                    <p className="text-sm text-parchment-dim">つぎのミッション</p>
                    <p className="mt-1 text-xl font-bold leading-snug text-parchment">{next.title}</p>
                  </div>
                  <LinkButton href={`/journey/missions/${next.id}`}>つづきをはじめる</LinkButton>
                </Card>
              ) : (
                overview.progress?.allCompleted && (
                  <Card highlight className="space-y-4 text-center">
                    <p className="text-xl font-bold text-gold-soft">すべて完了しました</p>
                    <LinkButton href="/journey/complete">修了ページへ</LinkButton>
                  </Card>
                )
              )}

              <div className="space-y-3">
                <h2 className="text-base font-bold text-gold-soft">ミッション</h2>
                {overview.missions.map((mission, index) => (
                  <MissionCard key={mission.id} mission={mission} index={index + 1} />
                ))}
              </div>

              <div className="pt-2">
                <TextLink href="/journey/progress">これまでの記録を見る</TextLink>
              </div>
            </>
          )}

          <div className="pt-4">
            <TextLink href="/">← ホームに戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
