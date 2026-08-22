import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Passport実装指示書 PR-P2a。
//
// 「判定が1箇所に集約されていること」と「allowlist が画面から書き換えられないこと」を、
// ソース走査で機械的に担保する。判定が複数箇所に散ると、片方だけ直したときに
// 「付与は止まるのに取消では残高が動く」不整合が起きる。

const MODULES_ROOT = __dirname;
const SRC_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(SRC_ROOT, "..");
const MIGRATIONS = path.join(REPO_ROOT, "supabase/migrations");

function collect(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...collect(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) results.push(full);
  }
  return results;
}

const NON_TEST = collect(SRC_ROOT).filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
const rel = (p: string) => path.relative(SRC_ROOT, p);
const read = (p: string) => readFileSync(p, "utf8");

const LATEST = readFileSync(path.join(MIGRATIONS, "20260820000001_entitlement_allowlist.sql"), "utf8");

const GRANT = LATEST.slice(
  LATEST.indexOf("create or replace function process_entitlement_grant"),
  LATEST.indexOf("create or replace function process_entitlement_revocation")
);
const REVOCATION = LATEST.slice(LATEST.indexOf("create or replace function process_entitlement_revocation"));
const TYPE_MAP = LATEST.slice(
  LATEST.indexOf("create or replace function entitlement_balance_column_for_type"),
  LATEST.indexOf("create or replace function entitlement_balance_column(")
);

describe("判定の集約", () => {
  it("付与も取消も、種別→残高列の対応表を共有している", () => {
    // 付与は allowlist 込みの entitlement_balance_column() 経由、取消は種別のみの
    // entitlement_balance_column_for_type() 直呼び。対応表そのものは1つ。
    expect(GRANT).toContain("entitlement_balance_column(");
    expect(REVOCATION).toContain("entitlement_balance_column_for_type(");
  });

  // ここが本PRの要。判定式を関数の外に残すと、いずれ片方だけ直されてずれる。
  it("最新版の付与・取消に、残高列を決める case 式が残っていない", () => {
    const functionsBody = LATEST.slice(LATEST.indexOf("create or replace function process_entitlement_grant"));
    expect(functionsBody).not.toMatch(/case\s+v_entitlement\.entitlement_type/);
  });

  it("付与側の判定関数が allowlist テーブルを参照している", () => {
    const decider = LATEST.slice(
      LATEST.indexOf("create or replace function entitlement_balance_column("),
      LATEST.indexOf("create or replace function entitlement_balance_was_applied")
    );
    expect(decider).toContain("entitlement_source_allowlist");
  });
});

describe("取消は allowlist を再評価しない", () => {
  // allowlist は運用で変わる。取消の時点で再評価すると、未許可のまま付与された行を
  // 後から承認したときに「入れていない残高」を引いてしまう。
  it("取消関数が allowlist テーブルを参照していない", () => {
    expect(REVOCATION).not.toContain("entitlement_source_allowlist");
    expect(REVOCATION).not.toContain("source_system_key");
  });

  it("取消関数が、付与時に適用したかどうかを見ている", () => {
    expect(REVOCATION).toContain("entitlement_balance_was_applied(v_entitlement.application_decision)");
  });

  it("取消が呼ぶ対応表が送信元を引数に取らない", () => {
    expect(TYPE_MAP).not.toContain("p_source_system_key");
  });
});

describe("allowlist の変更経路", () => {
  // 画面から追加できると、誤操作ひとつで外部システムの権利が残高へ入り始める。
  it("entitlement_source_allowlist へ書き込むコードが存在しない", () => {
    const writers = NON_TEST.filter((file) => {
      const source = read(file);
      if (!source.includes('from("entitlement_source_allowlist")')) return false;
      return /from\("entitlement_source_allowlist"\)[\s\S]{0,300}?\.(insert|update|upsert|delete)\(/.test(source);
    }).map(rel);

    expect(writers).toEqual([]);
  });

  it("allowlist を変更するAPIが存在しない", () => {
    const routes = NON_TEST.filter((f) => f.includes("/api/") && f.endsWith("route.ts"));
    const violations = routes.filter((file) => {
      const source = read(file);
      if (!source.includes("entitlement_source_allowlist") && !source.includes("EntitlementSourceAllowlist")) {
        return false;
      }
      return /export async function (POST|PATCH|PUT|DELETE)\b/.test(source);
    }).map(rel);

    expect(violations).toEqual([]);
  });

  // 出荷時は空。マイグレーションが行を投入していないこと。
  it("マイグレーションが allowlist へ行を投入していない", () => {
    expect(LATEST).not.toMatch(/insert\s+into\s+entitlement_source_allowlist/i);
  });
});

describe("禁止対象", () => {
  it("禁止された送信元がコードのどこにも許可として書かれていない", () => {
    const allowlistModule = read(path.join(MODULES_ROOT, "entitlements/domain/allowlist.ts"));
    const forbiddenBlock = allowlistModule.slice(allowlistModule.indexOf("FORBIDDEN_SOURCE_SYSTEM_KEYS"));
    for (const key of ["sennokuni-nft-market", "sengoku-commerce", "ove-wallet"]) {
      expect(forbiddenBlock, key).toContain(key);
    }
  });

  it("適用対象の種別が2つだけ", () => {
    const allowlistModule = read(path.join(MODULES_ROOT, "entitlements/domain/allowlist.ts"));
    expect(allowlistModule).toContain('APPLICABLE_ENTITLEMENT_TYPES = ["kokudaka", "gacha_ticket"]');
  });

  // SQL側とTypeScript側で種別がずれていないこと。
  it("SQLの対応表も kokudaka / gacha_ticket の2つだけを扱う", () => {
    expect(TYPE_MAP).toContain("when 'kokudaka' then 'kokudaka'");
    expect(TYPE_MAP).toContain("when 'gacha_ticket' then 'gacha_tickets'");
    // 3つ目の when が無いこと。
    expect((TYPE_MAP.match(/when '/g) ?? []).length).toBe(2);
  });
});

describe("既存データの保護", () => {
  // 変更禁止範囲。既存の付与済み残高を取り消さない。
  it("マイグレーションが users の残高を直接更新していない", () => {
    const outsideFunctions = LATEST.slice(0, LATEST.indexOf("create or replace function process_entitlement_grant"));
    expect(outsideFunctions).not.toMatch(/update\s+users\s+set/i);
  });

  it("マイグレーションが entitlements の行を削除していない", () => {
    expect(LATEST).not.toMatch(/delete\s+from\s+entitlements/i);
  });

  // application_status は既存ロジックが依存している。値を増やさない。
  it("application_status の CHECK を張り替えていない", () => {
    expect(LATEST).not.toContain("entitlements_application_status_check");
  });
});
