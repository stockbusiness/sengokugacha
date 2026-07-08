export function Card({
  children,
  className = "",
  highlight = false,
  ornate = false,
}: {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
  ornate?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border ${
        highlight ? "border-gold/60" : "border-gold/15"
      } bg-ink-raised/80 p-5 shadow-lg shadow-black/30 backdrop-blur-sm ${ornate ? "ornate-frame" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
