import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// 「はじまりの旅」PR5-a。
//
// 「準備工程だけを先行し、実送信は行わない」ことを、ソース走査で機械的に担保する。
// 型やフラグで守っているつもりでも、1行足せば送れてしまう状態を残さない。

const MODULES_ROOT = __dirname;
const SRC_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(SRC_ROOT, "..");

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

// Wallet送信に関わるファイル。
const WALLET_FILES = NON_TEST.filter((f) => {
  const r = rel(f);
  return (
    r.includes("wallet") ||
    r.includes("learning-journey/domain/reward-") ||
    r === "lib/learning-journey-reward-dispatch.ts"
  );
});

describe("実送信をしていないこと", () => {
  it("走査対象を取りこぼしていない", () => {
    expect(NON_TEST.length).toBeGreaterThan(100);
    expect(WALLET_FILES.length).toBeGreaterThanOrEqual(6);
  });

  // PR5-aは外部送信なし。HTTPアダプタはPR5-b。
  it("Wallet関連ファイルに外部送信のコードが無い", () => {
    const senders = WALLET_FILES.filter((file) => {
      const source = read(file);
      return /\bfetch\(/.test(source) || /\baxios\b/.test(source) || /node:https?/.test(source);
    }).map(rel);

    expect(senders).toEqual([]);
  });

  it("HTTPアダプタの実装が存在しない", () => {
    const httpAdapters = NON_TEST.filter((f) => /http-wallet-adapter|wallet-http-adapter/.test(rel(f))).map(rel);
    expect(httpAdapters).toEqual([]);
  });

  // 署名やHMACはPR5-b。ここで書き始めると、鍵の扱いが先に散らばる。
  it("署名・HMAC生成のコードが無い", () => {
    const signers = WALLET_FILES.filter((file) => {
      const source = read(file);
      return /createHmac|X-OVE-|Signature/i.test(source);
    }).map(rel);

    expect(signers).toEqual([]);
  });
});

describe("利用者識別子の禁止事項", () => {
  // 2026-08-22のご指示。いずれも「該当コードを書かない」ことで守る。
  it("common_user_id をWallet送信に使っていない", () => {
    const violations = WALLET_FILES.filter((file) => {
      const source = read(file);
      // コメントでの言及は許す。実際に値として組み立てている箇所だけを見る。
      return /commonUserId\s*[,:)]/.test(source) || /common_user_id:\s*/.test(source);
    }).map(rel);

    expect(violations).toEqual([]);
  });

  it("users.id を externalUserId として渡していない", () => {
    const violations = WALLET_FILES.filter((file) => {
      const source = read(file);
      return /externalUserId:\s*(user\.id|userId|user_id)\b/.test(source);
    }).map(rel);

    expect(violations).toEqual([]);
  });

  it("メール・LINE ID から識別子を導出していない", () => {
    const violations = WALLET_FILES.filter((file) => {
      const source = read(file);
      return /\b(email|lineUserId|line_user_id)\b/.test(source);
    }).map(rel);

    expect(violations).toEqual([]);
  });

  // 型として common_user_id を送れる形が無いこと。あると「型があるから使ってよい」と読める。
  it("WalletUserRef が external_user_id 方式しか持たない", () => {
    const contract = read(path.join(MODULES_ROOT, "learning-journey/domain/wallet-contract.ts"));
    const refBlock = contract.slice(
      contract.indexOf("export type WalletUserRef"),
      contract.indexOf("export type WalletGrantRequest")
    );
    expect(refBlock).toContain("external_user_id");
    expect(refBlock).not.toContain("commonUserId");
  });
});

describe("フラグ", () => {
  // 管理画面から実送信へ切り替えられないようにする。
  it("wallet_adapter が更新可能な設定型に含まれていない", () => {
    const settings = read(path.join(SRC_ROOT, "lib/learning-journey-settings.ts"));
    expect(settings).not.toContain("wallet_adapter");
  });

  it("wallet_adapter を書き込むコードが存在しない", () => {
    const writers = NON_TEST.filter((file) => {
      const source = read(file);
      return /wallet_adapter:\s*['"]/.test(source);
    }).map(rel);

    expect(writers).toEqual([]);
  });

  it("コード側ゲートが閉じている", () => {
    const source = read(path.join(SRC_ROOT, "lib/wallet-adapter-settings.ts"));
    expect(source).toContain("export const WALLET_HTTP_ADAPTER_ALLOWED = false");
  });
});

describe("付与要求の状態と後日付与", () => {
  // ご指示4。状態は現行7つのまま増やさない。
  it("reward_requests の status CHECK が7状態のまま", () => {
    const foundation = readFileSync(
      path.join(REPO_ROOT, "supabase/migrations/20260815000001_learning_journey_foundation.sql"),
      "utf8"
    );
    expect(foundation).toContain(
      "check (status in ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'LIMIT_HELD', 'CANCELLED', 'REVERSED'))"
    );

    // 後続のマイグレーションがこの制約を張り替えていないこと。
    const migrationsDir = path.join(REPO_ROOT, "supabase/migrations");
    const rewriters = readdirSync(migrationsDir).filter((name) => {
      if (name === "20260815000001_learning_journey_foundation.sql") return false;
      const sql = readFileSync(path.join(migrationsDir, name), "utf8");
      return /learning_journey_reward_requests[\s\S]{0,200}?status_check/.test(sql);
    });
    expect(rewriters).toEqual([]);
  });

  // REWARD_DISABLED / DEFERRED_DECISION は判定記録側にだけ存在する。
  it("送信状態に REWARD_DISABLED / DEFERRED_DECISION を足していない", () => {
    const stateMachine = read(path.join(MODULES_ROOT, "learning-journey/domain/reward-state-machine.ts"));
    const transitions = stateMachine.slice(stateMachine.indexOf("const TRANSITIONS"));
    expect(transitions).not.toContain("REWARD_DISABLED");
    expect(transitions).not.toContain("DEFERRED_DECISION");
  });

  // ご指示4。6要件を満たさない変更経路を先に作らない。
  it("判定を PENDING へ変更するコードが存在しない", () => {
    const violations = NON_TEST.filter((file) => {
      const source = read(file);
      if (!source.includes("REWARD_DISABLED") && !source.includes("DEFERRED_DECISION")) return false;
      // decision を書き換える update 呼び出しがあれば違反。
      return /from\("learning_journey_reward_decisions"\)[\s\S]{0,300}?\.update\(/.test(source);
    }).map(rel);

    expect(violations).toEqual([]);
  });

  it("付与要求を作るのは REQUESTED のときだけ、という判定が存在する", () => {
    const decision = read(path.join(MODULES_ROOT, "learning-journey/domain/reward-decision.ts"));
    expect(decision).toContain("export function shouldCreateRewardRequest");
    expect(decision).toContain('decision.kind === "REQUESTED"');
  });
});

describe("秘密値", () => {
  it("Wallet関連ファイルに秘密値らしき環境変数参照が無い", () => {
    const violations = WALLET_FILES.filter((file) => {
      const source = read(file);
      return /process\.env\.[A-Z0-9_]*(KEY|SECRET|TOKEN)/.test(source);
    }).map(rel);

    expect(violations).toEqual([]);
  });

  it("付与要求に署名値を保存する列を作っていない", () => {
    const migration = readFileSync(
      path.join(REPO_ROOT, "supabase/migrations/20260819000001_wallet_send_foundation.sql"),
      "utf8"
    );
    for (const forbidden of ["signature", "api_key", "secret", "access_token"]) {
      expect(migration.toLowerCase(), forbidden).not.toContain(`add column if not exists ${forbidden}`);
    }
  });
});
