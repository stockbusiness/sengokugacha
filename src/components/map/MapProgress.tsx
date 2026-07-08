export function MapProgress({ conquered, total }: { conquered: number; total: number }) {
  const progress = total > 0 ? Math.round((conquered / total) * 100) : 0;

  return (
    <div className="mb-6 text-center">
      <p className="text-xs tracking-[0.3em] text-gold/70">JAPAN MAP</p>
      <h1 className="font-heading mt-1 text-3xl font-bold text-gold-soft">日本地図</h1>
      <div className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-ink-raised/80 px-4 py-1.5">
        <span className="text-sm font-semibold text-parchment">制圧国数:</span>
        <span className="font-heading text-lg font-bold text-gold-soft">
          {conquered} / {total}
        </span>
      </div>
      <div className="mx-auto mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-ink-line/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-crimson to-gold transition-[width] duration-700"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="制圧進捗"
        />
      </div>
    </div>
  );
}
