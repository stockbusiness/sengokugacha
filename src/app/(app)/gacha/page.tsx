"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, LinkButton, TextLink } from "@/components/ui/Button";
import { GachaReveal } from "@/components/gacha/GachaReveal";
import { GachaVideoOverlay } from "@/components/gacha/GachaVideoOverlay";
import { SummonStage } from "@/components/gacha/SummonStage";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type DrawAnimation = {
  id: string;
  key: string;
  videoUrl: string;
  posterUrl: string | null;
  durationMs: number;
  allowSkip: boolean;
  skipAfterMs: number;
  hasAudio: boolean;
};

type DrawResult = {
  drawLogId: string;
  warlord: {
    id: string;
    name: string;
    rarity: string;
    slotType: string;
    lore: string | null;
    imageUrl: string | null;
  };
  province: { id: string; name: string };
  provinceConquered: boolean;
  regionCompleted: string | null;
  regionCompletionBonus: number;
  minoUnlocked: boolean;
  tenkaToitsuTriggered: boolean;
  isNewCard: boolean;
  animation: DrawAnimation | null;
  remainingFreeDrawsToday?: number;
  remainingPaidDrawsToday?: number;
  remainingGachaTickets?: number;
};

type Mode = "free" | "paid";
type Status = "initializing" | "idle" | "drawing" | "playing_video" | "revealing" | "done" | "error";

function logAnimationEvent(
  eventType: string,
  result: DrawResult,
  extra?: { errorCode?: string; playbackMs?: number }
) {
  const isLiff = typeof window !== "undefined" && /Line/i.test(window.navigator.userAgent);
  fetch("/api/gacha/animation-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      drawLogId: result.drawLogId,
      animationAssetId: result.animation?.id ?? null,
      animationKey: result.animation?.key ?? null,
      rarity: result.warlord.slotType,
      isLiff,
      ...extra,
    }),
  }).catch(() => {
    /* 分析ログの送信失敗はユーザー体験に影響させない */
  });
}

export default function GachaPage() {
  const [status, setStatus] = useState<Status>("initializing");
  const [mode, setMode] = useState<Mode>("free");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsTickets, setNeedsTickets] = useState(false);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        setStatus("idle");
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

  async function handleDraw(drawMode: Mode) {
    setStatus("drawing");
    setMode(drawMode);
    setErrorMessage(null);
    setNeedsTickets(false);

    try {
      const endpoint = drawMode === "free" ? "/api/gacha/draw" : "/api/gacha/draw-paid";
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        if (res.status === 402) setNeedsTickets(true);
        throw new Error(body.error ?? "ガチャの実行に失敗しました。");
      }

      const drawResult = body as DrawResult;
      setResult(drawResult);
      setStatus(drawResult.animation ? "playing_video" : "revealing");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
      setStatus("error");
    }
  }

  const remaining =
    mode === "free" ? result?.remainingFreeDrawsToday ?? 0 : result?.remainingPaidDrawsToday ?? 0;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="ガチャ" />

      {status === "initializing" && <p className="text-center text-parchment-dim">読み込み中...</p>}

      {(status === "idle" || status === "drawing") && (
        <SummonStage>
          <Button onClick={() => handleDraw("free")} disabled={status === "drawing"}>
            {status === "drawing" && mode === "free" ? "抽選中..." : "無料ガチャを引く"}
          </Button>
          <Button variant="secondary" onClick={() => handleDraw("paid")} disabled={status === "drawing"}>
            {status === "drawing" && mode === "paid" ? "抽選中..." : "有料ガチャを引く(ガチャ券1枚消費)"}
          </Button>
        </SummonStage>
      )}

      {status === "error" && errorMessage && (
        <div className="space-y-2">
          <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
            {errorMessage}
          </Card>
          {needsTickets && <LinkButton href="/purchase">ガチャ券を購入する</LinkButton>}
        </div>
      )}

      {status === "playing_video" && result?.animation && (
        <GachaVideoOverlay
          animation={result.animation}
          onEvent={(eventType, extra) => logAnimationEvent(eventType, result, extra)}
          onComplete={() => setStatus("revealing")}
        />
      )}

      {status === "revealing" && result && (
        <GachaReveal
          warlord={result.warlord}
          provinceName={result.province.name}
          onFinish={() => {
            logAnimationEvent("gacha_result_revealed", result);
            setStatus("done");
          }}
        />
      )}

      {status === "done" && result && (
        <div className="space-y-4">
          {result.provinceConquered && (
            <Card className="border-gold/50 bg-gold/10 text-center text-sm font-semibold text-gold-soft">
              {result.province.name}国を制圧しました!
            </Card>
          )}

          {result.regionCompleted && (
            <Card className="border-gold/50 bg-gold/10 text-center text-sm font-semibold text-gold-soft">
              {result.regionCompleted}地方コンプリート!石高+{result.regionCompletionBonus.toLocaleString()}
            </Card>
          )}

          {result.minoUnlocked && (
            <Card className="border-crimson/60 bg-crimson-soft/50 text-center text-sm font-semibold text-parchment">
              美濃国(岐阜)への挑戦権が解放されました!
            </Card>
          )}

          {result.tenkaToitsuTriggered && (
            <LinkButton href="/tenka-toitsu">天下統一達成!代表武将を選ぶ →</LinkButton>
          )}

          <Card className="text-center">
            <p className="text-xs font-medium text-parchment-dim">{result.province.name}国</p>
            <p className="font-heading mt-1 text-xl font-bold text-parchment">{result.warlord.name}</p>
            <p className="mt-1 text-sm text-gold-soft">{result.warlord.rarity}</p>
            {result.warlord.lore && (
              <p className="mt-3 text-sm text-parchment-dim">{result.warlord.lore}</p>
            )}
          </Card>

          <p className="text-center text-xs text-parchment-dim">
            {mode === "free"
              ? `本日の無料ガチャ残り回数: ${remaining}`
              : `本日の有料ガチャ残り回数: ${remaining}(ガチャ券残り: ${result.remainingGachaTickets ?? 0}枚)`}
          </p>

          <Button onClick={() => handleDraw(mode)} disabled={remaining <= 0}>
            もう一度引く
          </Button>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-2 border-t border-gold/15 pt-6">
        <TextLink href="/regions">地方コンプ状況を見る</TextLink>
        <TextLink href="/tenka-toitsu">天下統一の状況を見る</TextLink>
      </div>
      <div className="mt-2">
        <TextLink href="/rates">排出率を見る</TextLink>
      </div>
    </div>
  );
}
