import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート モジュール化・保守性改善指示書 §6・§12。
// Repository実装がDBクライアントをこの1箇所からのみ取得するようにする窓口。
// 既存の`@/lib/supabase-server`は変更しない(Service Role Keyの取得・クライアント
// 生成ロジックはそのまま)。将来Repositoryのテスト時にDbClientをモック実装へ
// 差し替えられるよう、型と取得関数をここに集約する。
export type DbClient = ReturnType<typeof createSupabaseServerClient>;

export function getDbClient(): DbClient {
  return createSupabaseServerClient();
}
