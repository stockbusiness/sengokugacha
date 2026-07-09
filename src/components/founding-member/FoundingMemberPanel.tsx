import { Card } from "@/components/ui/Card";
import { FoundingMemberBadge } from "@/components/founding-member/FoundingMemberBadge";
import { formatFoundingMemberNumber } from "@/lib/founding-member";
import type { PassportData } from "@/lib/passport";

// 既存土地オーナー向けの創設メンバー情報パネル。指示書4章の表示項目に対応。
export function FoundingMemberPanel({ passport }: { passport: PassportData }) {
  if (!passport.isFoundingMember) return null;

  return (
    <Card highlight ornate>
      <FoundingMemberBadge
        variant="founding"
        suffix={passport.foundingMemberNumber != null ? `No.${formatFoundingMemberNumber(passport.foundingMemberNumber)}` : undefined}
      />
      <p className="mt-3 text-sm leading-relaxed text-parchment">
        あなたは戦国国家の初期建設に参加した創設メンバーです。メタバース実装時、国家開発区画の優先反映対象となります。
      </p>
      <ul className="mt-3 space-y-1 text-xs text-parchment-dim">
        <li>✦ メタバース優先権: 実装時に優先的に区画反映</li>
        <li>✦ 建国メンバー商品への特別価格案内</li>
        <li>✦ 国家建設会議のご案内(戦国パスポート内でお知らせします)</li>
      </ul>
    </Card>
  );
}
