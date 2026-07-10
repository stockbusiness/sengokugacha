"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";

type SlotType = "common" | "mid" | "rare";

type GachaRevealProps = {
  warlord: {
    name: string;
    rarity: string;
    slotType: string;
    imageUrl: string | null;
  };
  provinceName: string;
  onFinish: () => void;
};

type Phase = "anticipation" | "burst" | "card";

type TierConfig = {
  label: string;
  ringClass: string;
  burstClass: string;
  cardBorderClass: string;
  glowClass: string;
  labelClass: string;
  particleCount: number;
  burstScale: number;
  shake: boolean;
};

const TIER_CONFIG: Record<SlotType, TierConfig> = {
  common: {
    label: "出陣",
    ringClass: "border-parchment-dim/40",
    burstClass: "bg-parchment-dim/50",
    cardBorderClass: "border-gold/25",
    glowClass: "shadow-[0_0_30px_rgba(183,168,136,0.25)]",
    labelClass: "text-parchment-dim",
    particleCount: 4,
    burstScale: 6,
    shake: false,
  },
  mid: {
    label: "武将出現",
    ringClass: "border-purple/70",
    burstClass: "bg-purple/60",
    cardBorderClass: "border-purple/70",
    glowClass: "shadow-[0_0_55px_rgba(107,58,162,0.5)]",
    labelClass: "text-purple",
    particleCount: 12,
    burstScale: 9,
    shake: false,
  },
  rare: {
    label: "大名級出現!!",
    ringClass: "border-gold",
    burstClass: "bg-gradient-to-br from-gold via-crimson to-gold",
    cardBorderClass: "border-gold",
    glowClass: "shadow-[0_0_90px_rgba(201,162,39,0.75)]",
    labelClass: "gacha-shimmer-text",
    particleCount: 24,
    burstScale: 13,
    shake: true,
  },
};

function resolveSlotType(slotType: string): SlotType {
  if (slotType === "rare" || slotType === "mid") return slotType;
  return "common";
}

// レンダー中に呼んでも安全な決定論的な疑似乱数(0〜1)。同じseedなら常に同じ値を返す。
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

type Particle = { key: number; sx: string; sy: string; delay: string };

export function GachaReveal({ warlord, provinceName, onFinish }: GachaRevealProps) {
  const [phase, setPhase] = useState<Phase>("anticipation");
  const tier = TIER_CONFIG[resolveSlotType(warlord.slotType)];
  const cardRef = useRef<HTMLDivElement | null>(null);

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: tier.particleCount }, (_, i) => {
        const angle = (Math.PI * 2 * i) / tier.particleCount + pseudoRandom(i) * 0.4;
        const distance = 90 + pseudoRandom(i + 0.5) * 100;
        return {
          key: i,
          sx: `${Math.cos(angle) * distance}px`,
          sy: `${Math.sin(angle) * distance}px`,
          delay: `${pseudoRandom(i + 0.25) * 0.2}s`,
        };
      }),
    [tier.particleCount]
  );

  useEffect(() => {
    const toBurst = setTimeout(() => setPhase("burst"), 900);
    const toCard = setTimeout(() => setPhase("card"), 1400);
    return () => {
      clearTimeout(toBurst);
      clearTimeout(toCard);
    };
  }, []);

  useEffect(() => {
    if (phase !== "card" || !cardRef.current) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      if (reduceMotion) {
        gsap.set(cardRef.current, { opacity: 1, rotateY: 0, scale: 1, x: 0, y: 0 });
        return;
      }

      const tl = gsap.timeline();
      tl.fromTo(
        cardRef.current,
        { opacity: 0, rotateY: -110, scale: 0.82, y: 16 },
        {
          opacity: 1,
          rotateY: 0,
          scale: 1,
          y: 0,
          duration: tier.shake ? 0.6 : 0.45,
          ease: "back.out(1.7)",
        }
      );

      if (tier.shake) {
        tl.to(cardRef.current, {
          keyframes: [
            { x: -10, y: 4, rotate: -1.5 },
            { x: 9, y: -3, rotate: 1.2 },
            { x: -6, y: 2, rotate: -0.8 },
            { x: 4, y: -1, rotate: 0.4 },
            { x: 0, y: 0, rotate: 0 },
          ],
          duration: 0.4,
          ease: "power2.out",
        });
      }
    });

    return () => ctx.revert();
  }, [phase, tier.shake]);

  function skip() {
    setPhase("card");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-ink/97 px-6"
      onClick={phase !== "card" ? skip : undefined}
    >
      {phase === "anticipation" && (
        <div className="flex flex-col items-center gap-6">
          <div className="relative flex h-56 w-56 items-center justify-center">
            <div
              className={`absolute h-full w-full rounded-full border-4 ${tier.ringClass}`}
              style={{ animation: "gacha-ring-spin 2.2s linear infinite" }}
            />
            <div
              className={`absolute h-36 w-36 rounded-full border-2 ${tier.ringClass}`}
              style={{ animation: "gacha-pulse 1s ease-in-out infinite" }}
            />
            <span className="font-heading text-5xl text-gold-soft">運</span>
          </div>
          <p className="text-xs tracking-[0.3em] text-parchment-dim">運命の一枚を引いています…</p>
        </div>
      )}

      {phase === "burst" && (
        <>
          {tier.shake && (
            <>
              {/* 大名級専用: 雷光(画面全体)と家紋の閃光。 */}
              <div
                className="pointer-events-none fixed inset-0 bg-gradient-to-b from-gold-soft/70 via-transparent to-transparent mix-blend-screen"
                style={{ animation: "gacha-lightning 0.9s ease-out forwards" }}
              />
              <div
                className="pointer-events-none fixed inset-0 overflow-hidden mix-blend-screen"
                aria-hidden="true"
              >
                <div
                  className="absolute -inset-y-full left-1/2 w-8 -translate-x-1/2 bg-gradient-to-r from-transparent via-parchment/90 to-transparent"
                  style={{ animation: "gacha-blade-flash 0.55s ease-out 0.1s forwards" }}
                />
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 flex items-center justify-center"
                style={{ animation: "gacha-crest-flash 0.7s ease-out forwards" }}
              >
                <svg width="220" height="220" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="46" stroke="var(--color-gold)" strokeWidth="1.5" opacity="0.8" />
                  <circle cx="50" cy="50" r="34" stroke="var(--color-gold-soft)" strokeWidth="1" opacity="0.6" />
                  {Array.from({ length: 6 }, (_, i) => {
                    const angle = (Math.PI * 2 * i) / 6;
                    const x1 = 50 + Math.cos(angle) * 20;
                    const y1 = 50 + Math.sin(angle) * 20;
                    const x2 = 50 + Math.cos(angle) * 44;
                    const y2 = 50 + Math.sin(angle) * 44;
                    return (
                      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-gold)" strokeWidth="1.5" opacity="0.75" />
                    );
                  })}
                  <circle cx="50" cy="50" r="7" fill="var(--color-gold-soft)" opacity="0.85" />
                </svg>
              </div>
            </>
          )}

          <div className="relative flex h-56 w-56 items-center justify-center">
            <div
              className={`absolute h-10 w-10 rounded-full ${tier.burstClass}`}
              style={
                {
                  animation: "gacha-burst 0.5s ease-out forwards",
                  "--burst-scale": tier.burstScale,
                } as React.CSSProperties
              }
            />
            <div className="absolute inset-0 rounded-full bg-parchment" style={{ animation: "gacha-flash 0.5s ease-out forwards" }} />
          </div>
        </>
      )}

      {phase === "card" && (
        <div className="relative flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
          {particles.map((p) => (
            <span
              key={p.key}
              className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-gold-soft"
              style={
                {
                  animation: `gacha-sparkle 1s ease-out ${p.delay} forwards`,
                  "--sx": p.sx,
                  "--sy": p.sy,
                } as React.CSSProperties
              }
            />
          ))}

          <p className={`text-xs font-semibold tracking-[0.3em] ${tier.labelClass}`}>{tier.label}</p>

          <div style={{ perspective: "1000px" }}>
            {warlord.imageUrl ? (
              // カード画像自体に武将名・レアリティ・スキル等が焼き込まれているため、
              // 余計なテキストを重ねずイラストをそのまま主役として見せる。
              <div
                ref={cardRef}
                className={`w-64 overflow-hidden rounded-2xl border-2 ${tier.cardBorderClass} ${tier.glowClass}`}
                style={{ opacity: 0 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={warlord.imageUrl} alt={warlord.name} className="block h-auto w-full" />
              </div>
            ) : (
              <div
                ref={cardRef}
                className={`flex flex-col items-center gap-4 rounded-2xl border-2 ${tier.cardBorderClass} ${tier.glowClass} bg-ink-raised px-8 py-10`}
                style={{ opacity: 0 }}
              >
                <div
                  className={`flex h-24 w-24 items-center justify-center rounded-full border-2 ${tier.cardBorderClass} bg-gradient-to-br from-ink to-ink-raised text-3xl font-bold text-gold-soft`}
                >
                  {warlord.name.slice(0, 1)}
                </div>

                <div className="text-center">
                  <p className="text-xs text-parchment-dim">{provinceName}国</p>
                  <p className="font-heading text-2xl font-bold text-parchment">{warlord.name}</p>
                  <p className="mt-1 text-sm text-gold-soft">{warlord.rarity}</p>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onFinish}
            className="mt-2 rounded-lg border border-gold/40 bg-gradient-to-b from-crimson to-crimson-dark px-6 py-2 text-sm font-semibold text-parchment transition hover:from-crimson/90"
          >
            結果を見る
          </button>
        </div>
      )}

      {phase !== "card" && <p className="mt-8 text-xs text-parchment-dim/60">タップでスキップ</p>}
    </div>
  );
}
