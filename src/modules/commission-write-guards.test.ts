import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Passport実装指示書 PR-P1a / PR-P1b。
//
// 「画面を消すだけで、APIやバッチから再開できる状態を残さない」ことを、ソース走査で
// 機械的に担保する。個々のルートやバッチをHTTPレベルで叩くテストはSupabase接続を
// 必要とし、CIでは動かせない。ここで検証したいのは実行時の値ではなく構造
// (ガードを通らない書込み口が存在しないこと)なので、静的検査が目的に合っている。

const SRC_ROOT = path.join(__dirname, "..");

function collect(dir: string, filter: (p: string) => boolean): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collect(full, filter));
    } else if (filter(full)) {
      results.push(full);
    }
  }
  return results;
}

const ALL_SOURCES = collect(SRC_ROOT, (p) => p.endsWith(".ts") || p.endsWith(".tsx"));
const rel = (p: string) => path.relative(SRC_ROOT, p);
const read = (p: string) => readFileSync(p, "utf8");

describe("commission_ledgerへの新規計上口", () => {
  // Stripe webhook・retry-grant・cron・再送・補完処理のどれから来ても、新規計上は
  // postLandSaleCommission() を通る。経路ごとにガードを置くのではなく、計上処理本体の
  // 入口1箇所で止める設計なので、「他に insert する場所が無いこと」が停止の前提になる。
  it("commission_ledgerへinsertするのは castle-commissions.ts だけ", () => {
    const inserters = ALL_SOURCES.filter((file) => {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return false;
      const source = read(file);
      if (!source.includes('from("commission_ledger")')) return false;
      // .from("commission_ledger") に続けて .insert( を呼んでいるか
      return /from\("commission_ledger"\)[\s\S]{0,400}?\.insert\(/.test(source);
    }).map(rel);

    expect(inserters).toEqual(["lib/castle-commissions.ts"]);
  });

  it("postLandSaleCommission() は本体の先頭で停止判定を通す", () => {
    const source = read(path.join(SRC_ROOT, "lib/castle-commissions.ts"));
    const body = source.slice(source.indexOf("export async function postLandSaleCommission"));
    const guardAt = body.indexOf('decideCommissionWriteFromSettings("land_sale_commission")');
    const insertAt = body.indexOf('.from("commission_ledger").insert(');

    expect(guardAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    // ガードがinsertより手前にあること。
    expect(guardAt).toBeLessThan(insertAt);
  });

  it("停止時は例外を投げずに早期returnする", () => {
    const source = read(path.join(SRC_ROOT, "lib/castle-commissions.ts"));
    const guardBlock = source.slice(
      source.indexOf('decideCommissionWriteFromSettings("land_sale_commission")'),
      source.indexOf('.from("purchases")')
    );
    // throw すると runStep() が markStepFailed() を呼び、決済済みの利用者が
    // 区画を受け取れなくなる。ここは必ず return。
    expect(guardBlock).toContain("return;");
    expect(guardBlock).not.toContain("throw");
  });

  it("停止時は監査ログに記録する(件数を監視できるようにするため)", () => {
    const source = read(path.join(SRC_ROOT, "lib/castle-commissions.ts"));
    expect(source).toContain("recordCommissionWriteBlocked");
  });
});

describe("報酬ルールの書込みAPI", () => {
  const RULE_SET_ROUTES = collect(path.join(SRC_ROOT, "app/api/admin/commission-rule-sets"), (p) =>
    p.endsWith("route.ts")
  );

  it("走査対象のルートを取りこぼしていない", () => {
    expect(RULE_SET_ROUTES.length).toBeGreaterThanOrEqual(3);
  });

  // 「フロントエンドの非表示だけで終わらせない」(PR-P1b 追加条件3)。
  it("書込みメソッドを持つルートは全て停止判定を通す", () => {
    const unguarded = RULE_SET_ROUTES.filter((file) => {
      const source = read(file);
      const hasWriteMethod = /export async function (POST|PATCH|PUT|DELETE)\b/.test(source);
      if (!hasWriteMethod) return false;
      return !source.includes("rejectIfCommissionWriteDisabled");
    }).map(rel);

    expect(unguarded).toEqual([]);
  });

  it("書込みメソッドの数だけガード呼び出しがある", () => {
    for (const file of RULE_SET_ROUTES) {
      const source = read(file);
      const writeMethods = source.match(/export async function (POST|PATCH|PUT|DELETE)\b/g) ?? [];
      const guards = source.match(/rejectIfCommissionWriteDisabled\(/g) ?? [];
      expect(guards.length, `${rel(file)}: 書込みメソッド${writeMethods.length}件に対しガード${guards.length}件`).toBe(
        writeMethods.length
      );
    }
  });

  // 既存ルールは監査・調査目的で残す(削除しない)。参照は従来どおり通す。
  it("GET(参照)はガードしない", () => {
    const listRoute = read(path.join(SRC_ROOT, "app/api/admin/commission-rule-sets/route.ts"));
    const getBody = listRoute.slice(
      listRoute.indexOf("export async function GET"),
      listRoute.indexOf("export async function POST")
    );
    expect(getBody).not.toContain("rejectIfCommissionWriteDisabled");
  });
});

describe("停止フラグの変更経路", () => {
  // 「フラグ変更UIを作らない」「一般管理画面から変更できないようにする」(追加条件4)。
  it("commission-write-settings APIは参照(GET)しか持たない", () => {
    const route = read(path.join(SRC_ROOT, "app/api/admin/commission-write-settings/route.ts"));
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)\b/);
  });

  it("commission_write_settings へ書き込むコードが存在しない", () => {
    const writers = ALL_SOURCES.filter((file) => {
      if (file.endsWith(".test.ts")) return false;
      const source = read(file);
      if (!source.includes('from("commission_write_settings")')) return false;
      return /from\("commission_write_settings"\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/.test(source);
    }).map(rel);

    expect(writers).toEqual([]);
  });
});

describe("支払処理の二重実行", () => {
  // 「同じ支払処理を再実行しても二重支払にならない」(必須テスト)。
  //
  // PR-P1d で、対象抽出・payouts作成・ledger更新を DB関数の1トランザクションへ移した。
  // 以前はこの3手がAPI側に分かれており、同一受取者への同時実行で payouts が
  // 二重作成され、支払総額が二重計上されえた(C3 の確認で判明)。
  const PAYOUT_FN = readFileSync(
    path.join(SRC_ROOT, "..", "supabase/migrations/20260822000001_payout_exclusivity.sql"),
    "utf8"
  );

  it("支払対象の抽出が未払い行(payout_id is null)に限定されている", () => {
    expect(PAYOUT_FN).toContain("payout_id is null");
    expect(PAYOUT_FN).toContain("status = 'confirmed'");
  });

  // ここが PR-P1d の要。for update が無いと、同時実行で payouts が2行できる
  // (ローカル実DBで再現: 2セッション交錯で payouts 2件・合計12,000円、ledger 6,000円)。
  //
  // コメントアウトを見逃さないよう、行頭から for update だけの行であることを見る。
  it("対象行を for update でロックしている", () => {
    expect(PAYOUT_FN).toMatch(/^\s*for update\s*$/m);
  });

  it("payouts の作成と ledger の更新が同じ関数の中にある(同一トランザクション)", () => {
    const body = PAYOUT_FN.slice(PAYOUT_FN.indexOf("create or replace function create_payout_for_recipient"));
    expect(body).toContain("insert into payouts");
    expect(body).toContain("update commission_ledger");
    expect(body).toContain("payout_id = v_payout_id");
  });

  // API側で直接 payouts を作ったり ledger を更新したりすると、排他が効かなくなる。
  it("支払APIが payouts へ直接 INSERT していない", () => {
    const route = read(path.join(SRC_ROOT, "app/api/admin/payouts/route.ts"));
    expect(route).toContain("create_payout_for_recipient");
    expect(route).not.toMatch(/from\("payouts"\)[\s\S]{0,200}?\.insert\(/);
  });

  it("支払APIが commission_ledger を直接更新していない", () => {
    const route = read(path.join(SRC_ROOT, "app/api/admin/payouts/route.ts"));
    expect(route).not.toMatch(/from\("commission_ledger"\)[\s\S]{0,200}?\.update\(/);
  });

  it("対象0件のときの応答が残っている", () => {
    const route = read(path.join(SRC_ROOT, "app/api/admin/payouts/route.ts"));
    expect(route).toContain("対象の確定済み報酬がありません");
  });

  // 監査ログの失敗を握り潰さず応答へ含める。ただし支払記録自体は成功させる
  // (止めると業務が止まる)。
  it("支払APIが監査ログの成否を応答へ含めている", () => {
    const route = read(path.join(SRC_ROOT, "app/api/admin/payouts/route.ts"));
    expect(route).toContain("logAdminActionWithResult");
    expect(route).toContain("auditLogged");
  });

  // 既存の106箇所へ影響を出さないため、logAdminAction() の握り潰しは維持する。
  it("logAdminAction() は従来どおり例外を握り潰す", () => {
    const lib = read(path.join(SRC_ROOT, "lib/admin-audit-log.ts"));
    const fn = lib.slice(lib.indexOf("export async function logAdminAction("), lib.indexOf("// PR-P1d"));
    expect(fn).not.toContain("return false");
    expect(fn).not.toContain("throw");
  });

  // 清算専用の画面。新しい報酬を作る処理を足さない。
  it("支払APIが commission_ledger へ行を追加していない", () => {
    const route = read(path.join(SRC_ROOT, "app/api/admin/payouts/route.ts"));
    expect(route).not.toMatch(/from\("commission_ledger"\)[\s\S]{0,200}?\.insert\(/);
    expect(PAYOUT_FN).not.toMatch(/insert\s+into\s+commission_ledger/i);
  });

  it("確認ダイアログに対象件数が出る", () => {
    const page = read(path.join(SRC_ROOT, "app/admin/(dashboard)/castle-payouts/page.tsx"));
    expect(page).toContain("describePayoutConfirmation");
    const domain = read(path.join(SRC_ROOT, "modules/castle/domain/payout-confirmation.ts"));
    expect(domain).toContain("対象件数");
  });
});

describe("管理画面の操作UI", () => {
  const RULE_SETS_PAGE = path.join(SRC_ROOT, "app/admin/(dashboard)/castle-commission-rules/page.tsx");

  // 「disabledではなく完全非表示」「DOMにも存在しない」(追加条件3・必須テスト)。
  // disabled属性で残すと、押せないボタンがDOMに残り続ける。条件付きレンダリングで消す。
  it("報酬ルール画面は操作UIを writeAllowed で条件付きレンダリングする", () => {
    const source = read(RULE_SETS_PAGE);
    expect(source).toContain("const writeAllowed = isCommissionWriteAllowed(notice)");
    // 作成フォームと、下書きに対する公開・編集・削除ボタン群の2箇所。
    expect((source.match(/writeAllowed/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("{writeAllowed && (");
    expect(source).toContain('{rs.status === "draft" && writeAllowed && (');
  });

  it("3画面とも移管バナーを表示する", () => {
    for (const page of ["castle-commission-rules", "castle-commissions", "castle-payouts"]) {
      const source = read(path.join(SRC_ROOT, `app/admin/(dashboard)/${page}/page.tsx`));
      expect(source, page).toContain("CommissionMigrationNotice");
    }
  });

  // 「API障害時の表示と対象0件の表示が区別される」(必須テスト)。
  it("3画面とも、0件表示に専用文言を使い、エラー表示と別物にしている", () => {
    for (const page of ["castle-commission-rules", "castle-commissions", "castle-payouts"]) {
      const source = read(path.join(SRC_ROOT, `app/admin/(dashboard)/${page}/page.tsx`));
      expect(source, page).toContain("EMPTY_STATE_TEXT");
      expect(source, page).toContain("読み込みに失敗しました");
    }
  });

  // 「売上ログ画面の削除・非表示・仕様変更は行わない」(追加条件5)。
  it("売上ログ画面には移管の仕組みを持ち込まない", () => {
    const source = read(path.join(SRC_ROOT, "app/admin/(dashboard)/agent-sales/page.tsx"));
    expect(source).not.toContain("CommissionMigrationNotice");
    expect(source).not.toContain("useCommissionAdminNotice");
  });
});
