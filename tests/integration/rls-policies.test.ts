import { afterEach, describe, expect, it } from "vitest";
import {
  createTestUser,
  deleteTestUser,
  getTestAnonSupabaseClient,
  getTestAuthenticatedSupabaseClient,
  getTestSupabaseClient,
  hasIntegrationTestDatabase,
} from "./support/env";
import {
  checkFutureFunctionExecutePrivilege,
  createFutureFunctionForDefaultPrivilegesCheck,
  dropFutureFunctionForDefaultPrivilegesCheck,
} from "./support/test-only-db-functions";

// 千ノ国パスポート Phase C-0(§15 RLS・権限テスト)。Phase C-0 PR4(§12)で
// anon/authenticatedのINSERT/DELETE、authenticatedロール自体、service role、
// および重要RPC関数の実行権限を追加した。
// 重要テーブルがRLS有効(かつポリシー未設定=anon/authenticatedからは全拒否、
// サーバー側service roleキー経由のみアクセス可能)という既存方針(初期スキーマの
// コメント参照)を、実際にanonキーで読み書きを試みて確認する。

const PROTECTED_TABLES = [
  "users",
  "purchases",
  "purchase_grant_steps",
  "entitlements",
  "integration_inbox_events",
  "integration_outbox_events",
  "stripe_webhook_events",
  "gacha_daily_usage",
  "agent_sales",
  "common_user_merge_conflicts",
  "unresolved_agent_assignments",
  "unresolved_common_user_merges",
] as const;

describe.skipIf(!hasIntegrationTestDatabase())("RLS: anonロールは重要テーブルを直接読み書きできない", () => {
  it.each(PROTECTED_TABLES)("%s はanonキーでSELECTできない(0件、またはエラー)", async (table) => {
    const anon = getTestAnonSupabaseClient();
    const { data, error } = await anon.from(table).select("*").limit(1);
    // RLSがポリシー無し=デフォルト拒否の場合、エラーにはならず0件が返る実装と、
    // 明示的にRLSエラーを返す実装の両方があり得るため、どちらでも許容し「行が
    // 取得できていない」ことのみを必須条件とする。
    if (error) {
      expect(error).toBeDefined();
    } else {
      expect(data).toEqual([]);
    }
  });

  const createdUserIds: string[] = [];
  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await deleteTestUser(userId);
    }
  });

  it("anonキーはusersへUPDATEできない(石高等の不正操作防止)", async () => {
    const serviceRole = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);

    const anon = getTestAnonSupabaseClient();
    await anon.from("users").update({ kokudaka: 999999 }).eq("id", userId);

    const { data: user, error } = await serviceRole.from("users").select("kokudaka").eq("id", userId).single();
    if (error) throw error;
    expect(user.kokudaka).toBe(0); // anon経由の更新は反映されていないこと
  });

  it("anonキーはusersへINSERTできない(不正なユーザー行の直接作成防止)", async () => {
    const serviceRole = getTestSupabaseClient();
    const anon = getTestAnonSupabaseClient();
    const lineUserId = `rls-test-anon-insert-${crypto.randomUUID()}`;

    await anon.from("users").insert({ line_user_id: lineUserId, display_name: "anon経由の不正作成" });

    const { data: rows, error } = await serviceRole.from("users").select("id").eq("line_user_id", lineUserId);
    if (error) throw error;
    expect(rows).toHaveLength(0); // anon経由のINSERTは反映されていないこと
  });

  it("anonキーはusersをDELETEできない(不正な削除防止)", async () => {
    const serviceRole = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);

    const anon = getTestAnonSupabaseClient();
    await anon.from("users").delete().eq("id", userId);

    const { data: user, error } = await serviceRole.from("users").select("id").eq("id", userId).maybeSingle();
    if (error) throw error;
    expect(user).not.toBeNull(); // anon経由のDELETEでは消えていないこと
  });
});

describe.skipIf(!hasIntegrationTestDatabase())("RLS: authenticatedロールもanonと同様に重要テーブルへ直接アクセスできない", () => {
  // このアプリはSupabase Authを使わない(LINEログイン+独自セッション)ため、
  // authenticatedロールで実際に発行されるJWTは無いが、ポリシーが一切定義されて
  // いない以上anonと同じくデフォルト拒否になるはずであることを確認する
  // (将来Supabase Authを使う経路が追加された場合の回帰検知も兼ねる)。
  it.each(PROTECTED_TABLES)("%s はauthenticatedロールでもSELECTできない(0件、またはエラー)", async (table) => {
    const authenticated = await getTestAuthenticatedSupabaseClient();
    const { data, error } = await authenticated.from(table).select("*").limit(1);
    if (error) {
      expect(error).toBeDefined();
    } else {
      expect(data).toEqual([]);
    }
  });

  const createdUserIds: string[] = [];
  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await deleteTestUser(userId);
    }
  });

  it("authenticatedロールはusersへUPDATEできない", async () => {
    const serviceRole = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);

    const authenticated = await getTestAuthenticatedSupabaseClient(userId);
    await authenticated.from("users").update({ kokudaka: 999999 }).eq("id", userId);

    const { data: user, error } = await serviceRole.from("users").select("kokudaka").eq("id", userId).single();
    if (error) throw error;
    expect(user.kokudaka).toBe(0);
  });

  it("authenticatedロールはusersへINSERTできない", async () => {
    const serviceRole = getTestSupabaseClient();
    const authenticated = await getTestAuthenticatedSupabaseClient();
    const lineUserId = `rls-test-authenticated-insert-${crypto.randomUUID()}`;

    await authenticated.from("users").insert({ line_user_id: lineUserId, display_name: "authenticated経由の不正作成" });

    const { data: rows, error } = await serviceRole.from("users").select("id").eq("line_user_id", lineUserId);
    if (error) throw error;
    expect(rows).toHaveLength(0);
  });

  it("authenticatedロールはusersをDELETEできない", async () => {
    const serviceRole = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);

    const authenticated = await getTestAuthenticatedSupabaseClient(userId);
    await authenticated.from("users").delete().eq("id", userId);

    const { data: user, error } = await serviceRole.from("users").select("id").eq("id", userId).maybeSingle();
    if (error) throw error;
    expect(user).not.toBeNull();
  });
});

describe.skipIf(!hasIntegrationTestDatabase())("RLS: service roleはRLSをバイパスして重要テーブルへ読み書きできる", () => {
  // anon/authenticatedが拒否されることばかり確認していると、「サーバー側の正規経路
  // (service roleキー)自体もまとめて塞いでしまっていた」という回帰(実際にPR #146で
  // 一度発生し、20260809000001で修正済み)を見落とす。service role側が引き続き
  // 正常に読み書きできることも明示的に確認する。
  it("service roleはusersへSELECT/INSERT/UPDATE/DELETEできる", async () => {
    const serviceRole = getTestSupabaseClient();
    const lineUserId = `rls-test-service-role-${crypto.randomUUID()}`;

    const { data: inserted, error: insertError } = await serviceRole
      .from("users")
      .insert({ line_user_id: lineUserId, display_name: "service role", kokudaka: 0 })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const { data: selected, error: selectError } = await serviceRole
      .from("users")
      .select("kokudaka")
      .eq("id", inserted.id)
      .single();
    if (selectError) throw selectError;
    expect(selected.kokudaka).toBe(0);

    const { error: updateError } = await serviceRole.from("users").update({ kokudaka: 100 }).eq("id", inserted.id);
    if (updateError) throw updateError;
    const { data: updated, error: updatedError } = await serviceRole
      .from("users")
      .select("kokudaka")
      .eq("id", inserted.id)
      .single();
    if (updatedError) throw updatedError;
    expect(updated.kokudaka).toBe(100);

    const { error: deleteError } = await serviceRole.from("users").delete().eq("id", inserted.id);
    if (deleteError) throw deleteError;
    const { data: afterDelete, error: afterDeleteError } = await serviceRole
      .from("users")
      .select("id")
      .eq("id", inserted.id)
      .maybeSingle();
    if (afterDeleteError) throw afterDeleteError;
    expect(afterDelete).toBeNull();
  });
});

// 千ノ国パスポート Phase C-0 PR4(§12)。テーブルのRLSだけでなく、残高・entitlement・
// inbox等を直接操作するPostgres関数自体のEXECUTE権限も確認する。PostgreSQLは
// 関数作成時にデフォルトでPUBLIC(anon/authenticated含む)へEXECUTEを許可するため、
// 明示的にrevokeしない限りRLSを完全に迂回してこれらの関数を呼び出せてしまう
// (指示書26f044d7 §12で指摘、実際にテストで検出したバグとして別コミットで修正する)。
const SENSITIVE_RPC_FUNCTIONS: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: "adjust_user_balance", args: { p_user_id: "00000000-0000-0000-0000-000000000000", p_column: "kokudaka", p_delta: 1 } },
  { name: "consume_gacha_ticket", args: { p_user_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "process_entitlement_grant", args: { p_entitlement_row_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "process_entitlement_revocation", args: { p_entitlement_row_id: "00000000-0000-0000-0000-000000000000" } },
  {
    name: "apply_purchase_balance_grant",
    args: {
      p_purchase_id: "00000000-0000-0000-0000-000000000000",
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_column: "kokudaka",
      p_delta: 1,
    },
  },
  {
    name: "claim_integration_inbox_event",
    args: {
      p_source_system_key: "rls-test",
      p_event_id: `rls-test-${crypto.randomUUID()}`,
      p_event_type: "rls-test",
      p_payload: {},
      p_payload_hash: "rls-test-hash",
      p_event_version: "1.0",
    },
  },
  {
    name: "record_purchase_agent_sale",
    args: {
      p_purchase_id: "00000000-0000-0000-0000-000000000000",
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_item_type: "kokudaka",
      p_amount: 1,
    },
  },
];

function isPermissionDeniedError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42501" || /permission denied for function/i.test(error.message ?? "");
}

describe.skipIf(!hasIntegrationTestDatabase())("RLS: 重要なRPC関数はanon/authenticatedから実行できない(service roleのみ)", () => {
  it.each(SENSITIVE_RPC_FUNCTIONS)("anonは$nameをRPC実行できない(permission denied)", async ({ name, args }) => {
    const anon = getTestAnonSupabaseClient();
    const { error } = await anon.rpc(name, args);
    expect(isPermissionDeniedError(error)).toBe(true);
  });

  it.each(SENSITIVE_RPC_FUNCTIONS)("authenticatedロールも$nameをRPC実行できない(permission denied)", async ({ name, args }) => {
    const authenticated = await getTestAuthenticatedSupabaseClient();
    const { error } = await authenticated.rpc(name, args);
    expect(isPermissionDeniedError(error)).toBe(true);
  });

  it.each(SENSITIVE_RPC_FUNCTIONS)("service roleは$nameをpermission deniedなしで呼び出せる(権限自体は保持している)", async ({ name, args }) => {
    const serviceRole = getTestSupabaseClient();
    const { error } = await serviceRole.rpc(name, args);
    // ダミーの存在しないID等を渡しているため業務エラー(該当行なし等)にはなり得るが、
    // 権限エラー(42501/permission denied for function)にだけはならないことを確認する。
    expect(isPermissionDeniedError(error)).toBe(false);
  });
});

describe.skipIf(!hasIntegrationTestDatabase())("RLS: 今後追加される関数にもdefault privilegesが自動適用される(マージ前最終修正指示§6)", () => {
  it("明示的なGRANT/REVOKEを一切行わない新規関数でも、anon/authenticatedはEXECUTEできずservice_roleのみEXECUTEできる", async () => {
    createFutureFunctionForDefaultPrivilegesCheck();
    try {
      expect(checkFutureFunctionExecutePrivilege("anon")).toBe(false);
      expect(checkFutureFunctionExecutePrivilege("authenticated")).toBe(false);
      expect(checkFutureFunctionExecutePrivilege("service_role")).toBe(true);
    } finally {
      dropFutureFunctionForDefaultPrivilegesCheck();
    }
  });
});
