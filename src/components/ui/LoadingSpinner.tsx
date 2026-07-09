// 画面デザインガイドの「ローディング」演出イメージに対応する共通スピナー。
// 既存のgacha-ring-spinキーフレーム(src/app/globals.css)を再利用する。
export function LoadingSpinner({ label = "読み込み中..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="relative h-11 w-11">
        <div className="absolute inset-0 rounded-full border-2 border-gold/15" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold"
          style={{ animation: "gacha-ring-spin 0.9s linear infinite" }}
        />
      </div>
      {label && <p className="text-xs tracking-[0.2em] text-parchment-dim">{label}</p>}
    </div>
  );
}
