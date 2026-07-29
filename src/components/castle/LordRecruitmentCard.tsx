import { Card } from "@/components/ui/Card";

export type LordRecruitment = {
  planPriceYen: number;
  contractTermMonths: number;
  initialPlotCapacity: number;
};

// 「この城の城主枠を販売中(城主募集中)」であることを伝えるカード。城主プランの申込は
// アプリ内では完結せず代理店経由での手続きになるため、条件を示したうえで問い合わせ先を案内する。
export function LordRecruitmentCard({ recruitment }: { recruitment: LordRecruitment }) {
  return (
    <Card highlight className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden="true">
          🏯
        </span>
        <p className="text-sm font-bold text-gold-soft">城主募集中</p>
      </div>

      <p className="text-xs leading-relaxed text-parchment-dim">
        この城は公式城主パートナーを募集しています。城主になると城の運営に参加でき、区画を販売するための販売枠が付与されます。
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-ink px-2 py-2 text-center">
          <p className="text-[10px] text-parchment-dim">城主プラン</p>
          <p className="mt-0.5 text-sm font-bold text-gold-soft">{recruitment.planPriceYen.toLocaleString()}円</p>
        </div>
        <div className="rounded-lg bg-ink px-2 py-2 text-center">
          <p className="text-[10px] text-parchment-dim">契約期間</p>
          <p className="mt-0.5 text-sm font-bold text-parchment">{recruitment.contractTermMonths}ヶ月</p>
        </div>
        <div className="rounded-lg bg-ink px-2 py-2 text-center">
          <p className="text-[10px] text-parchment-dim">初期販売枠</p>
          <p className="mt-0.5 text-sm font-bold text-parchment">{recruitment.initialPlotCapacity}区画</p>
        </div>
      </div>

      <p className="rounded-lg border border-gold/20 bg-ink px-3 py-2 text-center text-xs text-parchment">
        詳しくは代理店にお問い合わせください。
      </p>
    </Card>
  );
}
