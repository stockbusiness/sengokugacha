import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-crimson to-crimson-dark text-parchment border border-gold/40 shadow-[0_2px_12px_rgba(138,31,40,0.45)] hover:from-crimson/90 hover:to-crimson-dark/90",
  secondary:
    "bg-ink-raised text-gold-soft border border-gold/30 hover:border-gold/60 hover:bg-ink-raised/70",
};

const BASE_CLASSES =
  "block w-full rounded-lg px-4 py-3 text-center font-semibold tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />
  );
}

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block text-center text-sm text-parchment-dim underline decoration-gold/30 underline-offset-4 transition hover:text-gold-soft"
    >
      {children}
    </Link>
  );
}
