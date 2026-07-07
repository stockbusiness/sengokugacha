"use client";

// リッチメニュー等からホーム画面(/)を経由せず直接サブページへ来た場合でも
// ログインセッションを確立できるよう、各ページ共通で呼び出す初期化処理。
export type EnsureSessionResult = { status: "ready" } | { status: "redirecting" };

export async function ensureLiffSession(): Promise<EnsureSessionResult> {
  const configRes = await fetch("/api/app-config");
  const config = await configRes.json();
  const liffId: string | null = config.liffId;
  if (!liffId) {
    throw new Error("LIFF IDが管理画面(/admin/line-settings)で設定されていません。");
  }

  // 代理店紹介リンク(?ref=AGENT_CODE)を保持しておく。liff.login()はLINEの
  // 認証画面を経由してこのページへ戻ってくるため、sessionStorageに退避して
  // リダイレクト後も参照できるようにする(新規登録時のみ users.referring_agent_id
  // に反映され、既存ユーザーには影響しない)。
  const refFromUrl = new URLSearchParams(window.location.search).get("ref");
  if (refFromUrl) {
    sessionStorage.setItem("sengoku_ref_code", refFromUrl);
  }
  const refCode = refFromUrl ?? sessionStorage.getItem("sengoku_ref_code");

  const liff = (await import("@line/liff")).default;
  await liff.init({ liffId });

  if (!liff.isLoggedIn()) {
    liff.login();
    return { status: "redirecting" }; // LINEログイン画面へリダイレクトされる
  }

  const idToken = liff.getIDToken();
  if (!idToken) {
    throw new Error("LINEのIDトークンを取得できませんでした。");
  }

  const loginRes = await fetch("/api/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, refCode }),
  });

  if (!loginRes.ok) {
    const body = await loginRes.json().catch(() => ({}));
    throw new Error(body.error ?? "ログインに失敗しました。");
  }

  return { status: "ready" };
}
