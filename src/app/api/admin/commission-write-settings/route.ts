import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getAgencyIntegrationSettings } from "@/lib/agents";
import { getCommissionWriteSettings } from "@/lib/commission-write-settings";

// Passport実装指示書 PR-P1b。管理画面が「いま書込みが止まっているか」を知るための参照口。
//
// GETのみ。フラグを変更するAPIは意図的に用意しない(PR-P1b 追加条件4)。画面から切り替え
// られるようにすると、誤操作ひとつで報酬計上が再開する経路ができてしまう。再開には
// COMMISSION_WRITE_REOPEN_ALLOWED を開くコード変更と、設定行のinsertの両方が要る。
//
// 返すのは実効値(コード側ゲートを掛け合わせた後)。DBの生の値を見せると、画面には
// 「有効」と出るのに実際は停止している、という食い違いが起きる。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [settings, agency] = await Promise.all([getCommissionWriteSettings(), getAgencyIntegrationSettings()]);

  // 移管先への導線。未設定の環境ではnullを返し、画面側はリンクを出さない
  // (PR-P1b 追加条件1「遷移先が確定している場合」)。
  return NextResponse.json({ ...settings, agencyUrl: agency.sso_issuer_url || null });
}
