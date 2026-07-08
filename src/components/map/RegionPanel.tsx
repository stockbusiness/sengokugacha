import { forwardRef } from "react";

export const RegionPanel = forwardRef<
  HTMLDivElement,
  {
    title: string;
    conquered: number;
    total: number;
    children: React.ReactNode;
  }
>(function RegionPanel({ title, conquered, total, children }, ref) {
  const complete = total > 0 && conquered >= total;

  return (
    <div
      ref={ref}
      className={
        "scroll-mt-20 rounded-2xl border p-4 shadow-lg shadow-black/30 backdrop-blur-sm transition " +
        (complete ? "border-gold bg-ink-raised/90" : "border-gold/20 bg-ink-raised/80")
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/40 bg-ink text-xs text-gold-soft"
          >
            ⚜
          </span>
          <h2 className="font-heading text-sm font-bold text-gold-soft">{title}地方</h2>
        </div>
        <span className={"text-xs font-semibold " + (complete ? "text-gold-soft" : "text-parchment-dim")}>
          {conquered} / {total}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
});
