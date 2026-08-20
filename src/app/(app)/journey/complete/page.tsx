"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton, TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import { JourneyClosedNotice } from "@/components/journey/JourneyPieces";

type Overview = {
  enabled: boolean;
  course: { title: string } | null;
  progress: { totalMissions: number; completedMissions: number; allCompleted: boolean } | null;
};

// つぎに試せる無料の体験。購入や相談を必須に見せない(指示書§12)。
const NEXT_EXPERIENCES = [
  { href: "/gacha", icon: "🎴", label: "武将登用をためす", note: "無料でお試しいただけます" },
  { href: "/academy", icon: "📜", label: "AI寺子屋をのぞく", note: "学びの入口です" },
  { href: "/metaverse-tour", icon: "🏞️", label: "メタバースを内覧する", note: "見るだけでもどうぞ" },
  { href: "/events", icon: "🎆", label: "イベントを見る", note: "交流の場をご紹介します" },
];

export default function JourneyCompletePage() {
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

  const allCompleted = overview?.progress?.allCompleted ?? false;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-base text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && overview && !overview.enabled && (
        <>
          <PageHeader title="修了" />
          <JourneyClosedNotice />
        </>
      )}

      {status === "ready" && overview?.enabled && (
        <div className="space-y-5">
          <PageHeader title={allCompleted ? "旅の修了" : "とちゅうの記録"} />

          {allCompleted ? (
            <Card highlight className="text-center">
              <p className="text-2xl font-bold text-gold-soft">おつかれさまでした</p>
              <p className="mt-3 text-base leading-relaxed text-parchment">
                「{overview.course?.title ?? "はじまりの旅"}」のミッションをすべて終えました。
                ここからは、気になったものを自由にお試しください。
              </p>
            </Card>
          ) : (
            <Card className="text-center">
              <p className="text-base leading-relaxed text-parchment">
                まだ終えていないミッションがあります。
                {overview.progress && `（${overview.progress.totalMissions}つのうち ${overview.progress.completedMissions}つ完了）`}
              </p>
              <div className="mt-4">
                <LinkButton href="/journey">つづきをはじめる</LinkButton>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            <h2 className="text-base font-bold text-gold-soft">つぎにためせること</h2>
            {NEXT_EXPERIENCES.map((item) => (
              <a key={item.href} href={item.href} className="block">
                <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{item.icon}</span>
                    <div>
                      <p className="text-lg font-semibold text-parchment">{item.label}</p>
                      <p className="mt-0.5 text-sm text-parchment-dim">{item.note}</p>
                    </div>
                  </div>
                </Card>
              </a>
            ))}
          </div>

          {/* 相談の希望はPR6で扱う。ここでは既存のお問い合わせ導線だけを案内し、
              購入や相談を必須に見せない(指示書§12) */}
          <Card className="text-center">
            <p className="text-base leading-relaxed text-parchment-dim">
              ご不明な点があれば、お気軽にお問い合わせください。
            </p>
            <div className="mt-3">
              <TextLink href="/legal/support">お問い合わせ</TextLink>
            </div>
          </Card>
        </div>
      )}

      <div className="pt-6">
        <TextLink href="/journey">← はじまりの旅に戻る</TextLink>
      </div>
    </div>
  );
}
