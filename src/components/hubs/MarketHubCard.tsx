import Link from "next/link";

export function MarketHubCard() {
  return (
    <Link
      href="/market"
      className="block rounded-lg border border-gold/25 px-3 py-4 text-center text-xs font-semibold text-gold-soft transition hover:border-gold/50 hover:bg-ink-raised"
    >
      <p className="text-lg">🏮</p>
      <p className="mt-1">戦国市場</p>
    </Link>
  );
}
