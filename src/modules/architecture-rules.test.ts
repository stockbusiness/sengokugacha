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
function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const staticImportRegex = /(?:import|export)\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/g;
  const dynamicImportRegex = /import\(\s*["']([^"']+)["']\s*\)/g;
  for (const regex of [staticImportRegex, dynamicImportRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
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
