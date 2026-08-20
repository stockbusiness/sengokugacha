import { NextResponse } from "next/server";
import { decideCommissionWriteFromSettings } from "@/lib/commission-write-settings";
import type { CommissionWriteTarget } from "@/modules/castle/domain/commission-write-policy";

// Passport実装指示書 PR-P1a「APIは削除せず、書込み要求に機械判定可能なエラーコードを返す」。
//
// errorを文字列のまま残すのは、管理画面が data.error を文字列として読み、そのまま画面へ
// 出す作りだから(castle-commission-rules/page.tsx ほか)。{ error: { code, message } }の
// 入れ子に変えると既存画面が [object Object] を表示する。文字列のerrorを維持したまま
// codeを併記して、機械判定と既存UIを両立させる。
//
// 許可されていれば null を返す。呼び出し側は認証チェックの後に置くこと(未認証者へ
// 停止理由を漏らさないため)。
export async function rejectIfCommissionWriteDisabled(
  target: CommissionWriteTarget
): Promise<NextResponse | null> {
  const decision = await decideCommissionWriteFromSettings(target);
  if (decision.allowed) return null;

  return NextResponse.json({ error: decision.message, code: decision.code }, { status: 409 });
}
