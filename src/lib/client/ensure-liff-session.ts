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

    // sengoku-ai.com側への流入記録(EXTERNAL_DEVELOPER_GUIDE 10.1章)。URLに
    // ref付きで新規に到達した時点でのみ呼ぶ(ページ遷移のたびには呼ばない)。
    // 失敗してもログイン処理自体は継続する。
    try {
      const captureRes = await fetch("/api/referrals/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralToken: refFromUrl }),
      });
      const captureBody = await captureRes.json().catch(() => ({ sessionKey: null }));
      if (captureBody.sessionKey) {
        sessionStorage.setItem("sengoku_referral_session_key", captureBody.sessionKey);
      }
    } catch {
      // 紹介流入記録の失敗はログイン処理を止めない。
    }
  }
  const refCode = refFromUrl ?? sessionStorage.getItem("sengoku_ref_code");
  const referralSessionKey = sessionStorage.getItem("sengoku_referral_session_key");

  const liff = (await import("@line/liff")).default;
  await liff.init({ liffId });

  // 既にサーバーセッション(sengoku_session)が有効な場合は、LINEのIDトークン再検証を
  // スキップする。LIFFが保持するIDトークンはセッションCookieより先に期限切れになる
  // ことがあり、毎回の画面遷移で再検証させるとセッション自体は有効なのに失敗しうる。
  const sessionRes = await fetch("/api/auth/session", { method: "POST" });
  const sessionBody = await sessionRes.json().catch(() => ({ authenticated: false }));
  if (sessionBody.authenticated) {
    return { status: "ready" };
  }

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
    body: JSON.stringify({ idToken, refCode, referralSessionKey }),
  });

  if (!loginRes.ok) {
    const body = await loginRes.json().catch(() => ({}));
    throw new Error(body.error ?? "ログインに失敗しました。");
  }

  return { status: "ready" };
}
