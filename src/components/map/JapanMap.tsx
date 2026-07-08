"use client";

// 戦国風の高品質な日本地図アート(public/map-japan.webp)を背景に、
// 地方単位のホットスポットを百分率座標(x,y: 0-100)で重ねる。
// 文字・制圧状態はすべてHTMLで動的表示し、画像には焼き込まない。
export type RegionMarker = {
  region: string;
  x: number;
  y: number;
  conquered: number;
  total: number;
};

export function JapanMap({
  markers,
  onSelectRegion,
}: {
  markers: RegionMarker[];
  onSelectRegion: (region: string) => void;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-[28px] shadow-2xl shadow-black/60"
      style={{ aspectRatio: "941 / 1672" }}
    >
      <img
        src="/map-japan.webp"
        alt="金色の日本列島を描いた戦国風地図"
        className="absolute inset-0 h-full w-full select-none object-cover"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />

      {markers.map((m) => {
        const complete = m.total > 0 && m.conquered >= m.total;
        const started = m.conquered > 0;
        return (
          <button
            key={m.region}
            type="button"
            onClick={() => onSelectRegion(m.region)}
            aria-label={`${m.region}地方(${m.conquered}/${m.total}国制圧)の一覧へ移動`}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 p-1"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          >
            <span className="relative flex h-8 w-8 items-center justify-center">
              <span
                className={
                  "absolute inset-0 rounded-full blur-[2px] " +
                  (complete ? "bg-gold-soft/40" : started ? "motion-safe:animate-pulse bg-crimson/50" : "bg-transparent")
                }
              />
              <span
                className={
                  "relative block h-3.5 w-3.5 rounded-full border-2 transition group-active:scale-90 " +
                  (complete
                    ? "border-gold-soft bg-gold shadow-[0_0_12px_rgba(232,205,122,0.95)]"
                    : started
                      ? "border-gold bg-crimson shadow-[0_0_10px_rgba(138,31,40,0.8)]"
                      : "border-gold/50 bg-ink/80")
                }
              />
            </span>
            <span className="whitespace-nowrap rounded-full border border-gold/40 bg-ink/85 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gold-soft shadow">
              {m.region}
            </span>
          </button>
        );
      })}
    </div>
  );
}
