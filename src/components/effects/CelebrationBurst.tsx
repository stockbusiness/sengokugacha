"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

type Tone = "gold" | "crimson";

type CelebrationBurstProps = {
  lines: string[];
  tone?: Tone;
  onDismiss: () => void;
};

const TONE_STYLE: Record<Tone, { ring: string; particle: string; text: string }> = {
  gold: { ring: "border-gold", particle: "bg-gold-soft", text: "text-gold-soft" },
  crimson: { ring: "border-crimson", particle: "bg-crimson", text: "text-parchment" },
};

const PARTICLE_COUNT = 26;

// 国盗り・地方コンプ・美濃国解放・天下統一など、節目の達成を祝う全画面演出。
// 動画素材に依存せず、GSAPによるコード駆動のパーティクル・家紋フラッシュ・バナー登場で構成する。
export function CelebrationBurst({ lines, tone = "gold", onDismiss }: CelebrationBurstProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const crestRef = useRef<SVGSVGElement | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const particleRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const style = TONE_STYLE[tone];

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      if (reduceMotion) {
        gsap.set(rootRef.current, { opacity: 1 });
        gsap.set(bannerRef.current, { opacity: 1, scale: 1, y: 0 });
        gsap.set(crestRef.current, { opacity: 0.25, scale: 1.1 });
        return;
      }

      // 各トゥイーンは絶対時刻(タイムライン開始からの秒数)で配置する。
      // fromTo()はimmediateRenderの既定挙動により、相対位置("-=")でチェーンすると
      // 開始状態がタイムライン生成と同時に全パーティクルへ適用されてしまい、
      // 実際のトゥイーン開始時刻まで中央に静止して見える(バーストが遅れて見える)ため。
      const tl = gsap.timeline();

      tl.fromTo(rootRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0);
      tl.fromTo(
        crestRef.current,
        { opacity: 0, scale: 0.4, rotate: -15 },
        { opacity: 1, scale: 1.15, rotate: 0, duration: 0.45, ease: "back.out(2)" },
        0.1
      );
      tl.to(crestRef.current, { opacity: 0.3, scale: 1.4, duration: 0.7, ease: "power1.out" }, 0.5);

      particleRefs.current.forEach((el, i) => {
        if (!el) return;
        const angle = Math.random() * Math.PI * 2;
        const distance = 110 + Math.random() * 150;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance - 30;
        tl.fromTo(
          el,
          { opacity: 1, x: 0, y: 0, scale: 0.6, rotate: 0 },
          {
            x,
            y: y + 240,
            rotate: Math.random() * 360 - 180,
            scale: 0.9,
            opacity: 0,
            duration: 1.3 + Math.random() * 0.6,
            ease: "power2.out",
          },
          0.15 + i * 0.015
        );
      });

      tl.fromTo(
        bannerRef.current,
        { opacity: 0, scale: 0.7, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.7)" },
        0.55
      );
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/90 px-6"
      onClick={onDismiss}
    >
      <svg
        ref={crestRef}
        aria-hidden="true"
        className="pointer-events-none absolute h-64 w-64"
        viewBox="0 0 100 100"
        fill="none"
      >
        <circle cx="50" cy="50" r="46" stroke="var(--color-gold)" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="34" stroke="var(--color-gold-soft)" strokeWidth="1" />
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (Math.PI * 2 * i) / 8;
          const x1 = 50 + Math.cos(angle) * 20;
          const y1 = 50 + Math.sin(angle) * 20;
          const x2 = 50 + Math.cos(angle) * 44;
          const y2 = 50 + Math.sin(angle) * 44;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-gold)" strokeWidth="1.5" />;
        })}
      </svg>

      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            particleRefs.current[i] = el;
          }}
          aria-hidden="true"
          className={`pointer-events-none absolute h-2 w-2 rounded-sm ${style.particle}`}
        />
      ))}

      <div
        ref={bannerRef}
        className={`relative w-full max-w-sm rounded-2xl border-2 ${style.ring} bg-ink-raised/95 px-6 py-8 text-center shadow-[0_0_60px_rgba(0,0,0,0.6)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          {lines.map((line, i) => (
            <p
              key={i}
              className={i === 0 ? `font-heading text-xl font-bold ${style.text}` : "text-sm text-parchment"}
            >
              {line}
            </p>
          ))}
        </div>
        <button
          onClick={onDismiss}
          className="mt-6 rounded-lg border border-gold/40 bg-gradient-to-b from-crimson to-crimson-dark px-6 py-2 text-sm font-semibold text-parchment transition hover:from-crimson/90"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
