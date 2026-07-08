export function SummonStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="ornate-frame relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-b from-ink-raised to-ink px-4 pb-5 pt-6 shadow-2xl shadow-black/50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(138,31,40,0.28),transparent_55%)]" />

      <div className="relative text-center">
        <p className="text-[11px] tracking-[0.3em] text-parchment-dim">戦国召喚門</p>
        <h2 className="font-heading mt-1 text-lg font-bold text-gold-soft">運命の一枚を引け</h2>
      </div>

      <div className="relative mx-auto my-6 flex h-40 w-40 items-center justify-center">
        <div
          className="absolute h-full w-full rounded-full border border-gold/30"
          style={{ animation: "gacha-ring-spin 18s linear infinite" }}
        />
        <div
          className="absolute h-28 w-28 rounded-full border border-dashed border-gold/25"
          style={{ animation: "gacha-ring-spin 12s linear infinite reverse" }}
        />
        <div className="absolute h-20 w-20 rounded-full border border-gold/40" style={{ animation: "gacha-pulse 3s ease-in-out infinite" }} />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-gold-soft bg-gradient-to-b from-crimson-soft to-ink shadow-[0_0_28px_rgba(201,162,39,0.35)]">
          <span className="font-heading text-3xl text-gold-soft">運</span>
        </div>
      </div>

      <div className="relative space-y-2">{children}</div>
    </div>
  );
}
