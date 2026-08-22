// Passport実装指示書 PR-P4 ①「roleなし旧管理Cookieのmanagerフォールバック廃止」。
//
// セッションJWTの adminRole クレームから、管理者ロールを決める。
//
// 2ロール制の導入前に発行されたCookieには adminRole クレームが無い。導入時は互換の
// ため「クレームが無ければ manager」としていたが、これは受入条件
// 「roleなし旧管理Cookieでmanager権限を取得できない」に反する。
//
// ここでは manager と明示されている場合だけ manager とし、それ以外(operator /
// 未知の値 / 欠落 / 型違い)はすべて operator へ倒す(fail-closed)。判定できない
// ときに強い権限を与えない、という向きに揃える。

export type AdminRole = "operator" | "manager";

export function resolveAdminRole(claim: unknown): AdminRole {
  return claim === "manager" ? "manager" : "operator";
}
