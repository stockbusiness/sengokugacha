import { NextResponse } from "next/server";
import { decideCommissionWriteFromSettings, recordCommissionWriteBlocked } from "@/lib/commission-write-settings";
import type { CommissionWriteTarget } from "@/modules/castle/domain/commission-write-policy";

// Passport実装指示書 PR-P1a「APIは削除せず、書込み要求に機械判定可能なエラーコードを返す」。
//
// errorを文字列のまま残すのは、管理画面が data.error を文字列として読み、そのまま画面へ
// 出す作りだから(castle-commission-rules/page.tsx ほか)。{ error: { code, message } }の
// 入れ子に変えると既存画面が [object Object] を表示する。文字列のerrorを維持したまま
// codeを併記して、機械判定と既存UIを両立させる。
//
// PR-P1b。応答は 410 Gone。この機能はAgencyへ移管され、Passport側では恒久的に
// 提供されない(一時的な競合状態ではない)ため、410がいちばん近い。
export const COMMISSION_WRITE_DISABLED_STATUS = 410;

// 許可されていれば null を返す。呼び出し側は認証・権限チェックの後に置くこと
// (権限の無い相手へ移管状況を伝える必要は無く、401/403の方が正確な応答であるため)。
export async function rejectIfCommissionWriteDisabled(
  target: CommissionWriteTarget,
  context: string
): Promise<NextResponse | null> {
  const decision = await decideCommissionWriteFromSettings(target);
  if (decision.allowed) return null;

  await recordCommissionWriteBlocked(target, context);

  return NextResponse.json(
    { error: decision.message, code: decision.code },
    { status: COMMISSION_WRITE_DISABLED_STATUS }
  );
}
