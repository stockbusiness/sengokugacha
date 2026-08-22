import { createSupabaseServerClient } from "@/lib/supabase-server";

// 「はじまりの旅」PR5-a。Wallet送信アダプタの切替。
//
// learning_journey_settings の列だが、意図的に LearningJourneySettings 型へは含めない。
// あの型は LearningJourneySettingsUpdate = Partial<Omit<..., "id">> として管理APIの
// 更新入力になっており、含めると管理画面から実送信へ切り替えられてしまう。
// 読み取り専用のアクセサをここに分けることで、更新経路を構造的に断つ。

export type WalletAdapterKind = "fake" | "http";

// PR5-aで実装があるのは fake だけ。既定も fake。
export const DEFAULT_WALLET_ADAPTER: WalletAdapterKind = "fake";

// コード側ゲート。DBが 'http' でも、ここが false の間は fake のまま。
//
// 再開(実送信の開始)には「この定数を true にする変更のマージ」と「DBの設定変更」の
// 両方が要る。DBを直接触れる者の操作ミス1つでWalletへ送信が始まらないようにする。
// PR5-b でHTTPアダプタを実装し、接続確認が済むまで false のまま。
export const WALLET_HTTP_ADAPTER_ALLOWED = false;

export function resolveWalletAdapter(
  stored: WalletAdapterKind,
  httpAllowed: boolean = WALLET_HTTP_ADAPTER_ALLOWED
): WalletAdapterKind {
  if (!httpAllowed) return "fake";
  return stored;
}

export async function getStoredWalletAdapter(): Promise<WalletAdapterKind> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_settings")
    .select("wallet_adapter")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_WALLET_ADAPTER;
  return data.wallet_adapter === "http" ? "http" : "fake";
}

// 実際に使うアダプタ種別。
export async function getWalletAdapterKind(): Promise<WalletAdapterKind> {
  return resolveWalletAdapter(await getStoredWalletAdapter());
}
