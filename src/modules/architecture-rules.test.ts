import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// 千ノ国パスポート モジュール化・保守性改善指示書 §14(アーキテクチャ依存関係ルール)・PR14。
// domain層(src/modules/*/domain/)はSupabase/Next.js/Stripe等のインフラ・フレームワークに
// 依存しない、という設計原則をCIで機械的に検証する。
//
// 検証範囲: 各domainファイル自身が持つ直接importのみを対象とする(推移的な依存関係の解決
// (import先がさらに何をimportしているか)までは行わない)。過去に一度、この境界の見落とし
// (draw-policy.tsがsrc/lib/gacha-rate-tiers.ts経由でSupabaseへ間接依存していた問題、PR14で
// src/modules/gacha/domain/rate-tiers.tsへ切り出して解消済み)があったため、新規にdomain層へ
// ファイルを追加する際はimport先がさらに何に依存しているかも目視で確認すること。

const MODULES_ROOT = __dirname;

const FORBIDDEN_IMPORT_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^next(\/|$)/, reason: "Next.js" },
  { pattern: /^@supabase\//, reason: "Supabase SDK" },
  { pattern: /^stripe$/, reason: "Stripe SDK" },
  { pattern: /supabase-server/, reason: "Supabaseクライアント生成ラッパー(@/lib/supabase-server)" },
  { pattern: /^@\/lib\/stripe$/, reason: "Stripeクライアント生成ラッパー(@/lib/stripe)" },
];

function findDomainFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findDomainFiles(fullPath));
    } else if (
      entry.endsWith(".ts") &&
      !entry.endsWith(".test.ts") &&
      path.basename(path.dirname(fullPath)) === "domain"
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// `import ... from "spec"` / `export ... from "spec"` / `import("spec")` の"spec"部分を抽出する。
// `import type ... from "spec"`(型のみのimport)はコンパイル時に消え実行時の依存を
// 生まないため対象外とする(例: Stripeの型定義のみを使うcommerceモジュールのapplication層)。
function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticImportRegex = /(import|export)(\s+type)?\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/g;
  const dynamicImportRegex = /import\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = staticImportRegex.exec(source)) !== null) {
    const isTypeOnly = Boolean(match[2]);
    if (!isTypeOnly) specifiers.push(match[3]);
  }
  while ((match = dynamicImportRegex.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

const domainFiles = findDomainFiles(MODULES_ROOT);

describe("architecture rule: domain層はSupabase/Next.js/Stripeに直接依存しない", () => {
  it("finds at least one domain file to check (guards against a silently-empty test)", () => {
    expect(domainFiles.length).toBeGreaterThan(0);
  });

  it.each(domainFiles)("%s は禁止されたimportを持たない", (file) => {
    const relativePath = path.relative(path.resolve(MODULES_ROOT, "../.."), file);
    const source = readFileSync(file, "utf-8");
    const specifiers = extractImportSpecifiers(source);

    const violations = specifiers.flatMap((specifier) => {
      const matched = FORBIDDEN_IMPORT_PATTERNS.find(({ pattern }) => pattern.test(specifier));
      return matched ? [`"${specifier}"(${matched.reason})`] : [];
    });

    expect(violations, `${relativePath} が禁止されたimportを含んでいます: ${violations.join(", ")}`).toEqual([]);
  });
});

// 千ノ国パスポート Phase C-0(DB統合テスト・マイグレーション安全化・CI必須化指示書 §13)。
// application層(src/modules/*/application/)は、Repositoryインターフェース(ports.ts)
// のみに依存し、createSupabaseServerClient()・supabase.from()・supabase.rpc()・fetch()・
// NextRequest・NextResponseへ直接依存しないことを機械的に検証する。
// import文で判定できるもの(NextRequest/NextResponse/@supabase/*等)に加えて、
// .from(/.rpc(/createSupabaseServerClient(のようなメソッド・関数呼び出しはimportからは
// 判定できないため、ソースコード全体に対する文字列パターンでも検出する。

const APPLICATION_FORBIDDEN_IMPORT_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^next(\/|$)/, reason: "Next.js(NextRequest/NextResponse等)" },
  { pattern: /^@supabase\//, reason: "Supabase SDK" },
  { pattern: /^stripe$/, reason: "Stripe SDK" },
  { pattern: /supabase-server/, reason: "Supabaseクライアント生成ラッパー(@/lib/supabase-server)" },
  { pattern: /^@\/lib\/stripe$/, reason: "Stripeクライアント生成ラッパー(@/lib/stripe)" },
];

// NextRequest/NextResponseはimportベースの検査(APPLICATION_FORBIDDEN_IMPORT_PATTERNSの
// "next(/|$)")で検出する。コメント中の言及まで誤検出してしまうため、ソース全文への
// 文字列パターンでは検査しない(実際の型使用には必ずimportが伴うため、import検査で十分)。
const APPLICATION_FORBIDDEN_CALL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /createSupabaseServerClient\s*\(/, reason: "createSupabaseServerClient()の直接呼び出し" },
  { pattern: /\.from\s*\(\s*["'`]/, reason: "supabase.from()の直接呼び出し" },
  { pattern: /\.rpc\s*\(\s*["'`]/, reason: "supabase.rpc()の直接呼び出し" },
  { pattern: /(?<!\w)fetch\s*\(/, reason: "fetch()の直接呼び出し" },
];

function findApplicationFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findApplicationFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && path.basename(path.dirname(fullPath)) === "application") {
      results.push(fullPath);
    }
  }
  return results;
}

const applicationFiles = findApplicationFiles(MODULES_ROOT);

describe("architecture rule: application層はSupabase/Next.js/fetchに直接依存しない(Phase C-0 §13)", () => {
  it("finds at least one application file to check (guards against a silently-empty test)", () => {
    expect(applicationFiles.length).toBeGreaterThan(0);
  });

  it.each(applicationFiles)("%s は禁止されたimportを持たない", (file) => {
    const relativePath = path.relative(path.resolve(MODULES_ROOT, "../.."), file);
    const source = readFileSync(file, "utf-8");
    const specifiers = extractImportSpecifiers(source);

    const violations = specifiers.flatMap((specifier) => {
      const matched = APPLICATION_FORBIDDEN_IMPORT_PATTERNS.find(({ pattern }) => pattern.test(specifier));
      return matched ? [`"${specifier}"(${matched.reason})`] : [];
    });

    expect(violations, `${relativePath} が禁止されたimportを含んでいます: ${violations.join(", ")}`).toEqual([]);
  });

  it.each(applicationFiles)("%s はSupabase/fetchを直接呼び出さない", (file) => {
    const relativePath = path.relative(path.resolve(MODULES_ROOT, "../.."), file);
    const source = readFileSync(file, "utf-8");

    const violations = APPLICATION_FORBIDDEN_CALL_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
      ({ reason }) => reason
    );

    expect(violations, `${relativePath} が禁止された呼び出しを含んでいます: ${violations.join(", ")}`).toEqual([]);
  });
});
