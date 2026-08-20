import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Passport実装指示書 PR-P3(OVE誤表示の解消)。
//
// 参加者トップに「OVE移行予定ポイント」というカードがあり、users.contribution_points を
// 1:1でそのまま表示していた。同じ数値が同一画面の ContributionCard では
// 「国家貢献ポイント」として出ており、1つの内部ポイントが2つの名前で並んでいた。
// OVEはOVEW Walletが正本を持つ通貨であり、Passportの内部ポイントをその名前で
// 見せてはいけない(受入条件「Passport内部ポイントがOVEと表示されない」)。
//
// カードは撤去したが、これは「うっかり書けてしまう」種類の誤りなので、ソースを
// 走査して機械的に再発を防ぐ。将来のWallet残高カードはWallet APIの応答だけを入力に
// 取るため、contribution を参照する必要が無く、このルールに抵触しない。抵触したなら
// それは設計が誤っている合図として扱う。

const SRC_ROOT = path.join(__dirname, "..");

// 「OVE」という語の出現。日本語コメント中の「OVE付与」等も拾うため、単語境界は見ない。
const OVE_PATTERN = /OVE/;
// contribution_points / contributionPoints / contribution.total のいずれか。
const CONTRIBUTION_PATTERN = /contribution/i;

// このテスト自身は両方の語を説明のために含む。学習の旅のテストは付与額(Wallet正本)を
// 扱うもので国家貢献ポイントとは無関係だが、走査対象から外さず本文の規則で判定する。
const EXCLUDED_FILES = new Set(["ove-display-rules.test.ts"]);

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
    if (EXCLUDED_FILES.has(entry)) continue;
    results.push(fullPath);
  }
  return results;
}

const SOURCE_FILES = collectSourceFiles(SRC_ROOT);

describe("OVE表示のルール", () => {
  it("走査対象のファイルを取りこぼしていない", () => {
    // ルールが「0件だから常に成功する」状態に陥っていないことの確認。
    expect(SOURCE_FILES.length).toBeGreaterThan(100);
  });

  // 本体。「OVE」と「国家貢献ポイント」を同じファイルで扱うこと自体を禁じる。
  it("国家貢献ポイントをOVEとして扱うファイルが存在しない", () => {
    const violations = SOURCE_FILES.filter((file) => {
      const source = readFileSync(file, "utf8");
      return OVE_PATTERN.test(source) && CONTRIBUTION_PATTERN.test(source);
    }).map((file) => path.relative(SRC_ROOT, file));

    expect(
      violations,
      violations.length === 0
        ? ""
        : `OVEと国家貢献ポイント(contribution)を同じファイルで扱っています。` +
            `Passport内部ポイントをOVEとして表示してはいけません(PR-P3): ${violations.join(", ")}`
    ).toEqual([]);
  });

  it("撤去済みのOveWalletCardへの参照が残っていない", () => {
    const violations = SOURCE_FILES.filter((file) =>
      readFileSync(file, "utf8").includes("OveWalletCard")
    ).map((file) => path.relative(SRC_ROOT, file));

    expect(violations).toEqual([]);
  });
});
