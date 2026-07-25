import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestAnonSupabaseClient, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0(§15 RLS・権限テスト)。
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
});
