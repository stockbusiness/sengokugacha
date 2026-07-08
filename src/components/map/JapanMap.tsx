"use client";

// 簡略化した日本列島シルエット(装飾用・地方単位のクリック領域つき)。
// 正確な地理データではなく、戦国ガチャの世界観に合わせたスタイライズ表現。
const HOKKAIDO_PATH =
  "M 352.0 51.1 C 353.8 57.7 354.9 64.5 354.0 71.4 C 353.2 78.3 351.0 86.3 346.6 92.5 C 342.3 98.7 334.8 103.6 327.7 108.7 C 320.6 113.9 312.2 122.2 304.1 123.4 C 296.1 124.5 285.4 119.9 279.4 115.6 C 273.5 111.4 273.8 102.3 268.5 97.9 C 263.2 93.5 251.6 94.0 247.5 89.1 C 243.4 84.2 242.3 75.2 243.9 68.5 C 245.4 61.9 251.9 55.1 256.8 49.2 C 261.8 43.3 267.3 38.7 273.8 33.3 C 280.3 27.9 288.3 17.8 295.9 16.8 C 303.5 15.7 311.5 24.5 319.4 27.0 C 327.3 29.5 337.8 27.7 343.3 31.7 C 348.7 35.7 350.2 44.5 352.0 51.1 Z";
const HONSHU_PATH =
  "M 341.9 338.4 C 333.7 345.3 314.2 343.3 302.4 346.0 C 290.6 348.7 282.4 353.8 271.2 354.8 C 260.0 355.7 247.7 353.4 235.3 351.7 C 222.9 350.0 211.7 347.4 196.8 344.5 C 181.9 341.6 156.6 343.5 145.8 334.3 C 135.0 325.1 138.7 303.1 131.9 289.4 C 125.1 275.8 110.4 265.3 104.9 252.4 C 99.5 239.5 92.4 220.7 99.1 212.1 C 105.8 203.4 134.6 206.0 145.1 200.6 C 155.6 195.1 154.4 184.5 162.0 179.3 C 169.6 174.1 180.1 171.0 190.6 169.3 C 201.1 167.6 212.3 169.1 224.8 169.3 C 237.2 169.5 254.0 164.4 265.1 170.5 C 276.3 176.5 280.4 195.8 291.7 205.6 C 302.9 215.4 325.7 219.1 332.6 229.2 C 339.5 239.3 329.9 253.7 333.1 266.3 C 336.3 278.8 350.3 292.6 351.8 304.6 C 353.3 316.6 350.2 331.5 341.9 338.4 Z";
const SHIKOKU_PATH =
  "M 201.6 483.3 C 199.3 487.9 197.8 493.4 192.4 495.4 C 187.0 497.3 176.0 497.4 169.1 495.1 C 162.2 492.8 157.3 485.8 151.2 481.9 C 145.1 477.9 137.2 476.1 132.6 471.6 C 128.0 467.1 121.8 458.5 123.6 454.9 C 125.4 451.3 137.2 451.6 143.4 450.0 C 149.6 448.4 153.9 444.9 160.9 445.2 C 168.0 445.6 178.3 448.3 185.8 452.1 C 193.3 455.9 203.4 462.8 206.0 468.0 C 208.6 473.2 203.9 478.8 201.6 483.3 Z";
const KYUSHU_PATH =
  "M 152.4 489.0 C 154.3 496.9 139.6 509.9 134.1 518.0 C 128.6 526.1 124.7 529.5 119.3 537.7 C 113.9 545.9 109.9 563.5 101.8 567.1 C 93.7 570.7 79.7 564.3 70.8 559.4 C 61.9 554.5 54.3 546.0 48.4 537.7 C 42.4 529.5 36.5 519.3 35.2 509.7 C 33.9 500.0 38.0 489.6 40.8 479.9 C 43.6 470.2 45.9 459.1 52.2 451.4 C 58.5 443.8 69.4 434.3 78.4 434.0 C 87.4 433.7 98.9 443.6 106.2 449.7 C 113.6 455.8 114.9 463.9 122.5 470.5 C 130.2 477.0 150.4 481.1 152.4 489.0 Z";

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
    <div className="relative mx-auto aspect-[400/620] w-full max-w-xs">
      <svg
        viewBox="0 0 400 620"
        className="absolute inset-0 h-full w-full drop-shadow-[0_0_25px_rgba(201,162,39,0.25)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="japanGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8cd7a" />
            <stop offset="55%" stopColor="#c9a227" />
            <stop offset="100%" stopColor="#8a6b1a" />
          </linearGradient>
        </defs>
        <path d={HOKKAIDO_PATH} fill="url(#japanGold)" opacity={0.5} />
        <path d={HONSHU_PATH} fill="url(#japanGold)" stroke="#4a3620" strokeWidth={1.5} />
        <path d={SHIKOKU_PATH} fill="url(#japanGold)" stroke="#4a3620" strokeWidth={1.5} />
        <path d={KYUSHU_PATH} fill="url(#japanGold)" stroke="#4a3620" strokeWidth={1.5} />
      </svg>

      {markers.map((m) => {
        const complete = m.total > 0 && m.conquered >= m.total;
        const started = m.conquered > 0;
        return (
          <button
            key={m.region}
            type="button"
            onClick={() => onSelectRegion(m.region)}
            aria-label={`${m.region}地方(${m.conquered}/${m.total}国制圧)の一覧へ移動`}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 p-1"
            style={{ left: `${(m.x / 400) * 100}%`, top: `${(m.y / 620) * 100}%` }}
          >
            <span
              className={
                "block h-3.5 w-3.5 rounded-full border-2 transition group-active:scale-90 " +
                (complete
                  ? "border-gold-soft bg-gold shadow-[0_0_10px_rgba(232,205,122,0.9)]"
                  : started
                    ? "border-gold bg-crimson motion-safe:animate-pulse"
                    : "border-gold/50 bg-ink")
              }
            />
            <span className="whitespace-nowrap rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-gold-soft shadow">
              {m.region}
            </span>
          </button>
        );
      })}
    </div>
  );
}
