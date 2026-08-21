import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Passport実装指示書 PR-P1c。
//
// 「生成した販売事実が意図せず外へ出る」「スナップショットが後から書き換わる」といった
// 事故を、ソース走査で機械的に防ぐ。実行時の値ではなく構造を検証したいので静的検査が合う。

const SRC_ROOT = path.join(__dirname, "..");

function collect(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...collect(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) results.push(full);
  }
  return results;
}

const ALL = collect(SRC_ROOT);
const rel = (p: string) => path.relative(SRC_ROOT, p);
const read = (p: string) => readFileSync(p, "utf8");
const NON_TEST = ALL.filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));

const TABLE = "sales_fact_outbox_events";

describe("販売事実Outboxの書込み口", () => {
  it("走査対象を取りこぼしていない", () => {
    expect(NON_TEST.length).toBeGreaterThan(100);
  });

  it(`${TABLE} へ書き込むのは sales-fact-outbox.ts だけ`, () => {
    const writers = NON_TEST.filter((file) => {
      const source = read(file);
      if (!source.includes(`from("${TABLE}")`)) return false;
      return new RegExp(`from\\("${TABLE}"\\)[\\s\\S]{0,600}?\\.(insert|update|upsert|delete)\\(`).test(source);
    }).map(rel);

    expect(writers).toEqual(["lib/sales-fact-outbox.ts"]);
  });

  // 冪等性。既存行を上書きしない(C1回答 修正指示5)。
  it("upsertは ignoreDuplicates で、既存行を上書きしない", () => {
    const source = read(path.join(SRC_ROOT, "lib/sales-fact-outbox.ts"));
    expect(source).toContain("ignoreDuplicates: true");
    expect(source).toContain('onConflict: "source_system_key,event_id"');
  });

  it("重複時はpayload_hashを照合し、不一致を監査ログに残す", () => {
    const source = read(path.join(SRC_ROOT, "lib/sales-fact-outbox.ts"));
    expect(source).toContain("payload_hash");
    expect(source).toContain("SALES_FACT_PAYLOAD_MISMATCH_ACTION");
  });

  // 重複や不整合で購入処理を失敗させない(C1回答 修正指示5)。
  it("重複検知の分岐で例外を投げない", () => {
    const source = read(path.join(SRC_ROOT, "lib/sales-fact-outbox.ts"));
    const mismatchBlock = source.slice(source.indexOf("if (existing.payload_hash !== payloadHash)"));
    expect(mismatchBlock).not.toContain("throw");
  });

  // スナップショットは後から上書きしない(C1回答 修正指示7)。
  it("スナップショット列を更新するコードが存在しない", () => {
    const snapshotColumns = [
      "referral_session_key",
      "registration_referrer_agency_id",
      "assigned_agency_id",
      "sales_agent_id",
      "closing_agent_id",
      "occurred_at",
      "amount_minor",
    ];
    const violations: string[] = [];
    for (const file of NON_TEST) {
      const source = read(file);
      const updateCalls = source.match(new RegExp(`from\\("${TABLE}"\\)[\\s\\S]{0,600}?\\.update\\(\\{[\\s\\S]{0,600}?\\}`, "g")) ?? [];
      for (const call of updateCalls) {
        for (const column of snapshotColumns) {
          if (call.includes(column)) violations.push(`${rel(file)}: ${column}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("配送", () => {
  // 本PRでは配送を実装しない。Agencyの受信契約が確定してから別PRで足す。
  it("Agencyへ送信するコードが本PRに含まれていない", () => {
    const senders = NON_TEST.filter((file) => {
      const source = read(file);
      if (!source.includes("sales_fact") && !source.includes("salesFact") && !source.includes("SalesFact")) return false;
      return /\bfetch\(/.test(source);
    }).map(rel);

    expect(senders).toEqual([]);
  });

  it("配送状態を更新するコードがまだ無い", () => {
    const updaters = NON_TEST.filter((file) => {
      const source = read(file);
      return /delivery_status:\s*['"]/.test(source);
    }).map(rel);

    expect(updaters).toEqual([]);
  });
});

describe("フラグ", () => {
  // 管理画面から変更できないようにする(C1回答 修正指示6)。
  it("sales_fact_outbox_settings へ書き込むコードが存在しない", () => {
    const writers = NON_TEST.filter((file) => {
      const source = read(file);
      if (!source.includes('from("sales_fact_outbox_settings")')) return false;
      return /from\("sales_fact_outbox_settings"\)[\s\S]{0,300}?\.(insert|update|upsert|delete)\(/.test(source);
    }).map(rel);

    expect(writers).toEqual([]);
  });

  it("フラグ変更APIが存在しない", () => {
    const routes = NON_TEST.filter((f) => f.includes("/api/") && f.endsWith("route.ts"));
    const violations = routes.filter((file) => {
      const source = read(file);
      if (!source.includes("sales_fact_outbox_settings") && !source.includes("SalesFactOutboxSettings")) return false;
      return /export async function (POST|PATCH|PUT|DELETE)\b/.test(source);
    }).map(rel);

    expect(violations).toEqual([]);
  });

  // 販売事実の記録が旧報酬計上を再開させないことを、依存の不在で担保する。
  it("販売事実Outboxは commission_write_settings に触れない", () => {
    const source = read(path.join(SRC_ROOT, "lib/sales-fact-outbox.ts"));
    expect(source).not.toContain("commission_write_settings");
    expect(source).not.toContain("commission-write-settings");
    expect(source).not.toContain("commission_ledger");
  });
});

describe("売上ログ画面の文言(C4)", () => {
  const PAGE = path.join(SRC_ROOT, "app/admin/(dashboard)/agent-sales/page.tsx");

  // 「未払い売上」は「未払いの報酬」と誤解されうる(C4回答 案b)。
  it("「未払い売上」という表記が残っていない", () => {
    expect(read(PAGE)).not.toContain("未払い売上");
  });

  it("報酬額ではないことを明記している", () => {
    expect(read(PAGE)).toContain("報酬額ではありません");
  });
});
