import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート PR #147マージ前最終修正指示§5(ガチャ残テスト)。
//
// src/lib/gacha.ts の performDraw() は、動画演出の選定(selectAnimationForDraw、
// gacha_animation_assetsテーブル=「動画ステージング」の取得)が失敗しても、原子的
// トランザクション(execute_gacha_draw)は既にコミット済みのため、ガチャの抽選結果
// 自体を失敗させない設計を既に持っている(.catch(() => null)、仕様書2.1/5.4)。
// ソースコード実装済みの区分だったため、tests/integration/gacha-draw-rollback-and-
// conquest.test.ts のヘッダーコメントでは検証対象外(このDB RPC専用ファイルの
// スコープ外)と明記していたが、マージ前最終修正指示§5により、実際にその通り
// 動作することを検証するテストをここに追加する。

vi.mock("@/lib/gacha-animations", () => ({
  selectAnimationForDraw: vi.fn().mockRejectedValue(new Error("動画ステージング(gacha_animation_assets)の取得に失敗しました")),
}));

describe.skipIf(!hasIntegrationTestDatabase())("動画演出取得失敗時のフェイルセーフ", () => {
  const createdUserIds: string[] = [];

  beforeAll(() => {
    // src/lib/gacha.ts内部のcreateSupabaseServerClient()は本番用の環境変数名
    // (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)を読むため、CIワークフロー
    // 既定のダミー値のままではSupabase local(SUPABASE_TEST_URL等)に接続できない。
    // このテストファイル内でのみ、Supabase localの接続情報に一時的に差し替える
    // (vi.stubEnvはテストファイル単位で有効、afterAllのvi.unstubAllEnvs()で確実に戻す)。
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.SUPABASE_TEST_URL ?? "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const userId of createdUserIds.splice(0)) {
      await client.from("gacha_logs").delete().eq("user_id", userId);
      await client.from("gacha_daily_usage").delete().eq("user_id", userId);
      await client.from("user_warlords").delete().eq("user_id", userId);
      await client.from("user_activity").delete().eq("user_id", userId);
      await client.from("user_provinces").delete().eq("user_id", userId);
      await deleteTestUser(userId);
    }
  });

  it("動画演出の取得(selectAnimationForDraw)が失敗しても、無料ガチャ自体は成功しanimationはnullになる", async () => {
    const { drawFreeGacha } = await import("@/lib/gacha");
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);

    const result = await drawFreeGacha(userId);

    expect(result.animation).toBeNull();
    expect(result.drawLogId).toBeTruthy();
    expect(result.warlord.id).toBeTruthy();

    const { data: log, error } = await client
      .from("gacha_logs")
      .select("id, animation_asset_id, animation_key")
      .eq("id", result.drawLogId)
      .single();
    if (error) throw error;
    expect(log.animation_asset_id).toBeNull();
    expect(log.animation_key).toBeNull();
  });
});
