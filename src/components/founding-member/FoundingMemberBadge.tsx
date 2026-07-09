type Variant = "founding" | "builder";

const VARIANT_META: Record<Variant, { icon: string; label: string }> = {
  founding: { icon: "⛩️", label: "創設メンバー" },
  builder: { icon: "🏯", label: "建国メンバー" },
};

export function FoundingMemberBadge({ variant, suffix }: { variant: Variant; suffix?: string }) {
  const meta = VARIANT_META[variant];
  return (
    <span className="rounded-full border border-gold/50 bg-ink px-2.5 py-1 text-[11px] font-bold text-gold-soft">
      {meta.icon} {meta.label}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}
