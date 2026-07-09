"use client";

import { useEffect, useRef, useState } from "react";

type Animation = {
  videoUrl: string;
  posterUrl: string | null;
  durationMs: number;
  allowSkip: boolean;
  skipAfterMs: number;
  hasAudio: boolean;
};

type PlayState = "loading" | "needs-tap" | "playing" | "done";

// 仕様書12.4の推奨値。
const LOAD_TIMEOUT_MS = 5000;
const TOTAL_TIMEOUT_MS = 15000;

export function GachaVideoOverlay({
  animation,
  onComplete,
  onEvent,
}: {
  animation: Animation;
  onComplete: () => void;
  onEvent?: (eventType: "gacha_video_started" | "gacha_video_completed" | "gacha_video_skipped" | "gacha_video_failed", extra?: { errorCode?: string; playbackMs?: number }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playState, setPlayState] = useState<PlayState>("loading");
  const [muted, setMuted] = useState(true);
  const [showSkip, setShowSkip] = useState(false);
  const completedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);

  function finishOnce(eventType: "gacha_video_completed" | "gacha_video_skipped" | "gacha_video_failed", errorCode?: string) {
    if (completedRef.current) return;
    completedRef.current = true;
    setPlayState("done");
    const playbackMs = startedAtRef.current != null ? Date.now() - startedAtRef.current : undefined;
    onEvent?.(eventType, { errorCode, playbackMs });
    onComplete();
  }

  // 総演出上限(仕様書12.4)。動画が正常でも異常でも、この時間で必ず結果表示へ進む。
  useEffect(() => {
    const totalTimeout = setTimeout(() => finishOnce("gacha_video_failed", "total_timeout"), TOTAL_TIMEOUT_MS);
    return () => clearTimeout(totalTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 読み込みタイムアウト(仕様書12.4)。
  useEffect(() => {
    if (playState !== "loading") return;
    const loadTimeout = setTimeout(() => {
      if (playState === "loading") finishOnce("gacha_video_failed", "load_timeout");
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(loadTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playState]);

  // スキップ表示開始(仕様書14章)。
  useEffect(() => {
    if (!animation.allowSkip) return;
    const t = setTimeout(() => setShowSkip(true), animation.skipAfterMs);
    return () => clearTimeout(t);
  }, [animation.allowSkip, animation.skipAfterMs]);

  async function attemptPlay() {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setPlayState("playing");
      startedAtRef.current = Date.now();
      onEvent?.("gacha_video_started");
    } catch {
      // 自動再生失敗(仕様書12.3)。タップでの再生を促す。
      setPlayState("needs-tap");
    }
  }

  function handleTapToPlay() {
    attemptPlay();
  }

  function handleEnded() {
    finishOnce("gacha_video_completed");
  }

  function handleError() {
    finishOnce("gacha_video_failed", "media_error");
  }

  function handleSkip() {
    finishOnce("gacha_video_skipped");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <div className="relative aspect-[9/16] w-full max-w-sm overflow-hidden">
        <video
          ref={videoRef}
          src={animation.videoUrl}
          poster={animation.posterUrl ?? undefined}
          playsInline
          preload="metadata"
          muted={muted}
          controls={false}
          className="h-full w-full object-contain"
          onLoadedMetadata={() => attemptPlay()}
          onEnded={handleEnded}
          onError={handleError}
        />

        {playState === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold-soft border-t-transparent" />
          </div>
        )}

        {playState === "needs-tap" && (
          <button
            type="button"
            onClick={handleTapToPlay}
            className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-parchment"
          >
            タップして召喚を開始
          </button>
        )}

        {playState === "playing" && (
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            {animation.hasAudio && (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="rounded-full border border-gold/40 bg-ink/70 px-3 py-1.5 text-xs text-parchment"
              >
                {muted ? "🔇 ミュート中" : "🔊 音声ON"}
              </button>
            )}
            {showSkip && animation.allowSkip && (
              <button
                type="button"
                onClick={handleSkip}
                className="rounded-full border border-gold/40 bg-ink/70 px-3 py-1.5 text-xs text-parchment"
              >
                スキップ ›
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
