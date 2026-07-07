export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="font-heading text-2xl font-bold tracking-wide text-gold-soft">{title}</h1>
      <div className="mx-auto mt-2 h-px w-16 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
      {subtitle && <p className="mt-3 text-sm text-parchment-dim">{subtitle}</p>}
    </div>
  );
}
