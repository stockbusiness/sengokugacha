"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Hotspot = {
  id: string;
  title: string;
  description: string | null;
  positionX: number;
  positionY: number;
  icon: string | null;
  status: "available_now" | "planned" | "future_concept";
};

type Scene = {
  id: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  description: string | null;
  allowZoom: boolean;
  hotspots: Hotspot[];
  videoUrl: string | null;
  videoDurationMs: number | null;
};

type PropertySummary = {
  id: string;
  name: string;
  propertyCode: string;
};

type Status = "loading" | "ready" | "error";

const STATUS_LABEL: Record<Hotspot["status"], string> = {
  available_now: "現在提供中",
  planned: "開発予定",
  future_concept: "将来構想",
};

const EXPIRED_MESSAGE = "内覧用リンクの有効期限が切れました。LINEの戦国パスポートから、もう一度内覧を開いてください。";

function ExternalTourInner() {
  const params = useParams<{ propertyCode: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(() => (token ? "loading" : "error"));
  const [errorMessage, setErrorMessage] = useState<string | null>(() => (token ? null : EXPIRED_MESSAGE));
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const tourCompleteSent = useRef(false);

  const sendEvent = useCallback(
    (eventType: string, sceneId?: string) => {
      if (!token) return;
      fetch("/api/public/metaverse/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, eventType, sceneId }),
      }).catch(() => {
        /* 閲覧ログの記録失敗は内覧体験に影響させない */
      });
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;

    fetch(`/api/public/metaverse/tour-session?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? EXPIRED_MESSAGE);
        }
        return res.json();
      })
      .then((data: { property: PropertySummary; scenes: Scene[] }) => {
        setProperty(data.property);
        setScenes(data.scenes);
        setStatus("ready");
        sendEvent("tour_start");
        if (data.scenes[0]) sendEvent("scene_view", data.scenes[0].id);
        if (data.scenes.length === 1 && !tourCompleteSent.current) {
          tourCompleteSent.current = true;
          sendEvent("tour_complete", data.scenes[0]?.id);
        }
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : EXPIRED_MESSAGE);
        setStatus("error");
      });
    // sendEventは初回のtour_start送信にのみ使う。tokenが変わらない限り再実行不要。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const currentScene = scenes[sceneIndex] ?? null;

  const goToScene = useCallback(
    (index: number) => {
      if (index < 0 || index >= scenes.length) return;
      setSceneIndex(index);
      setActiveHotspot(null);
      setZoomed(false);
      const scene = scenes[index];
      if (scene) sendEvent("scene_view", scene.id);
      // 最終シーンまで到達した時点で「内覧完了」とみなす(一度だけ送信)。
      if (index === scenes.length - 1 && !tourCompleteSent.current) {
        tourCompleteSent.current = true;
        sendEvent("tour_complete", scene?.id);
      }
    },
    [scenes, sendEvent]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goToScene(sceneIndex + 1);
      if (e.key === "ArrowLeft") goToScene(sceneIndex - 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sceneIndex, goToScene]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const diff = endX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff < 0) goToScene(sceneIndex + 1);
      else goToScene(sceneIndex - 1);
    }
    touchStartX.current = null;
  }

  function handleImageDoubleClick() {
    if (!currentScene?.allowZoom) return;
    setZoomed((prev) => {
      const next = !prev;
      if (next) sendEvent("zoom", currentScene.id);
      return next;
    });
  }

  async function handleFavorite() {
    if (!token || !property) return;
    await fetch("/api/public/metaverse/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});
    setFavorited(true);
    sendEvent("favorite_add", currentScene?.id);
  }

  function handleReturnToLiff() {
    sendEvent("return_to_liff", currentScene?.id);
    if (window.opener || window.history.length <= 1) {
      window.close();
    } else {
      window.history.back();
    }
  }

  const orderedHotspots = useMemo(() => currentScene?.hotspots ?? [], [currentScene]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-parchment-dim">戦国城下町を読み込んでいます...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-parchment">{errorMessage}</p>
      </div>
    );
  }

  if (!currentScene) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <p className="text-sm text-parchment-dim">この物件にはまだ内覧シーンが登録されていません。</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      {uiVisible && (
        <div className="flex items-center justify-between gap-2 bg-black/70 px-4 py-3 text-sm">
          <button onClick={handleReturnToLiff} className="text-parchment-dim hover:text-parchment">
            ← 戻る
          </button>
          <div className="text-center">
            <p className="font-semibold text-parchment">{property?.name ?? params.propertyCode}</p>
            <p className="text-xs text-parchment-dim">
              {sceneIndex + 1} / {scenes.length} — {currentScene.name}
            </p>
          </div>
          <button onClick={handleFavorite} className="text-lg">
            {favorited ? "★" : "☆"}
          </button>
        </div>
      )}

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-black"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => setUiVisible((v) => !v)}
      >
        {currentScene.videoUrl ? (
          <video
            key={currentScene.id}
            src={currentScene.videoUrl}
            poster={currentScene.imageUrl}
            controls
            playsInline
            className="max-h-screen w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentScene.imageUrl}
            alt={currentScene.name}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleImageDoubleClick();
            }}
            className={`max-h-screen w-full object-contain transition-transform duration-300 ${zoomed ? "scale-[1.8] cursor-zoom-out" : "cursor-zoom-in"}`}
          />
        )}

        {!zoomed &&
          orderedHotspots.map((h) => (
            <button
              key={h.id}
              onClick={(e) => {
                e.stopPropagation();
                setActiveHotspot(h);
              }}
              style={{ left: `${h.positionX}%`, top: `${h.positionY}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold bg-ink/80 px-2 py-1 text-xs text-gold-soft shadow-lg"
            >
              {h.icon ?? "ⓘ"}
            </button>
          ))}

        {sceneIndex > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToScene(sceneIndex - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl text-parchment"
          >
            ‹
          </button>
        )}
        {sceneIndex < scenes.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToScene(sceneIndex + 1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl text-parchment"
          >
            ›
          </button>
        )}
      </div>

      {activeHotspot && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 px-4 pb-20"
          onClick={() => setActiveHotspot(null)}
        >
          <div className="w-full max-w-md rounded-xl border border-gold/30 bg-ink-raised p-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-parchment">{activeHotspot.title}</p>
            {activeHotspot.description && <p className="mt-1 text-sm text-parchment-dim">{activeHotspot.description}</p>}
            <p className="mt-2 text-xs font-semibold text-gold-soft">{STATUS_LABEL[activeHotspot.status]}</p>
          </div>
        </div>
      )}

      {uiVisible && (
        <div className="bg-black/70 px-3 py-3">
          {currentScene.description && <p className="mb-2 text-center text-xs text-parchment-dim">{currentScene.description}</p>}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goToScene(i)}
                className={`relative shrink-0 overflow-hidden rounded-lg border-2 ${i === sceneIndex ? "border-gold" : "border-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.thumbnailUrl ?? s.imageUrl} alt={s.name} className="h-14 w-20 object-cover" />
                {s.videoUrl && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-lg text-parchment">▶</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={handleReturnToLiff}
            className="mt-3 w-full rounded-lg border border-gold/40 bg-gradient-to-b from-crimson to-crimson-dark py-2.5 text-sm font-semibold text-parchment"
          >
            LINEに戻って相談する
          </button>
        </div>
      )}
    </div>
  );
}

export default function ExternalTourPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-parchment-dim">戦国城下町を読み込んでいます...</p>
        </div>
      }
    >
      <ExternalTourInner />
    </Suspense>
  );
}
