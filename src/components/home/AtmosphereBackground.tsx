// ホーム画面専用の淡い演出背景(和紙の質感・舞う桜・提灯の灯り・城のシルエット)。
// 通常画面はシンプルに保つ方針のため、このコンポーネントはホームでのみ使用する。
// 装飾のみのためスクリーンリーダーからは隠し、prefers-reduced-motionでは静止させる。
const PETALS = [
  { left: "6%", size: 10, duration: "14s", delay: "0s" },
  { left: "18%", size: 7, duration: "18s", delay: "2s" },
  { left: "32%", size: 9, duration: "16s", delay: "5s" },
  { left: "48%", size: 6, duration: "20s", delay: "1s" },
  { left: "63%", size: 10, duration: "15s", delay: "7s" },
  { left: "78%", size: 8, duration: "19s", delay: "3.5s" },
  { left: "90%", size: 7, duration: "17s", delay: "9s" },
];

export function AtmosphereBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 和紙の質感 */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(rgba(232,205,122,0.6) 0.6px, transparent 0.6px)",
          backgroundSize: "14px 14px",
        }}
      />

      {/* 提灯の灯り */}
      <div className="lantern-glow absolute -left-10 bottom-24 h-40 w-40 rounded-full bg-gold/20 blur-3xl" />
      <div
        className="lantern-glow absolute -right-8 bottom-40 h-32 w-32 rounded-full bg-crimson/25 blur-3xl"
        style={{ animationDelay: "1.2s" }}
      />

      {/* 舞う桜 */}
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="sakura-petal absolute top-[-5%] rounded-[0_60%_0_60%] bg-crimson-soft/35"
          style={
            {
              left: p.left,
              width: p.size,
              height: p.size,
              animationDuration: p.duration,
              animationDelay: p.delay,
            } as React.CSSProperties
          }
        />
      ))}

      {/* 城のシルエット */}
      <svg
        className="absolute bottom-0 left-0 w-full opacity-[0.08]"
        viewBox="0 0 400 70"
        preserveAspectRatio="none"
        fill="var(--color-gold-soft)"
      >
        <path d="M0 70V50h14V38l10-8 10 8v12h10V30l14-10 14 10v20h12V26l16-12 16 12v24h10V40l10-8 10 8v10h16V20l18-14 18 14v20h10V38l10-8 10 8v12h12V30l14-10 14 10v20h10V44l8-6 8 6v6h20v10z" />
      </svg>
    </div>
  );
}
