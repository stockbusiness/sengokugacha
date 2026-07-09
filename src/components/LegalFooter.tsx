import Link from "next/link";

const LINKS = [
  { href: "/rates", label: "排出率" },
  { href: "/founding-member", label: "創設メンバー制度" },
  { href: "/nation-builder", label: "建国メンバー制度" },
  { href: "/ranking", label: "国家ランキング" },
  { href: "/legal/tokushoho", label: "特定商取引法に基づく表記" },
  { href: "/legal/terms", label: "利用規約" },
  { href: "/legal/privacy", label: "プライバシーポリシー" },
  { href: "/legal/support", label: "お問い合わせ" },
  { href: "/account/delete", label: "退会" },
];

export function LegalFooter() {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-gold/10 px-4 py-3 text-[11px] text-parchment-dim/70">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="underline decoration-gold/20 underline-offset-2 transition hover:text-gold-soft">
          {link.label}
        </Link>
      ))}
    </div>
  );
}
