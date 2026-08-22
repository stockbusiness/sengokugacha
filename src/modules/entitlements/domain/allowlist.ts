// Passport実装指示書 PR-P2a「Entitlement適用範囲の制限」。
//
// Passportがローカル残高へ適用してよい権利を、明示的な allowlist で表す。
// 判定の正本はSQL関数 entitlement_balance_column()(付与・取消の両方が呼ぶ)で、
// ここはその同じ規則をTypeScript側から参照・検証できるようにしたもの。

// 残高へ実効果を持つ権利種別。Passport内ゲーム用途のみ。
//
// この2つに限るのは、適用先が users の実在する列だから。種別を増やすには列と
// コードの変更が要るため、設定テーブルではなくここに固定する。設定で増やせると
// 「users に列が無い種別」を許可できてしまう。
export const APPLICABLE_ENTITLEMENT_TYPES = ["kokudaka", "gacha_ticket"] as const;
export type ApplicableEntitlementType = (typeof APPLICABLE_ENTITLEMENT_TYPES)[number];

// 種別 → 残高列。
export const ENTITLEMENT_BALANCE_COLUMN: Record<ApplicableEntitlementType, "kokudaka" | "gacha_tickets"> = {
  kokudaka: "kokudaka",
  gacha_ticket: "gacha_tickets",
};

// Q6のご指示により、残高へ適用してはいけない送信元。
//
// allowlist 方式なので「登録しない」ことで自動的に拒否されるが、意図して拒否して
// いることが読み取れるよう既知の値を残す。将来これらを誤って allowlist へ足すと
// テストが落ちる。
export const FORBIDDEN_SOURCE_SYSTEM_KEYS = [
  "sennokuni-nft-market",
  "sengoku-commerce",
  "ove-wallet",
] as const;

// 同じく、残高へ適用してはいけない種別。generic は grant-entitlement.ts の既定値で、
// 送信元が entitlement_type を省略した場合に入る。
export const FORBIDDEN_ENTITLEMENT_TYPES = ["generic"] as const;

export type EntitlementApplicationDecision =
  | "APPLIED"
  | "SOURCE_NOT_ALLOWED"
  | "TYPE_NOT_APPLICABLE"
  | "USER_UNRESOLVED"
  | "DISMISSED";

export function isApplicableEntitlementType(entitlementType: string): entitlementType is ApplicableEntitlementType {
  return (APPLICABLE_ENTITLEMENT_TYPES as readonly string[]).includes(entitlementType);
}

// 送信元と種別の両方が一致したときだけ適用する(Q6回答 案d)。
//
// allowedSourceSystemKeys は entitlement_source_allowlist の内容。既定は空で、
// その場合はどの送信元からも適用しない。
export function decideEntitlementApplication(
  sourceSystemKey: string,
  entitlementType: string,
  allowedSourceSystemKeys: readonly string[]
): EntitlementApplicationDecision {
  if (!allowedSourceSystemKeys.includes(sourceSystemKey)) return "SOURCE_NOT_ALLOWED";
  if (!isApplicableEntitlementType(entitlementType)) return "TYPE_NOT_APPLICABLE";
  return "APPLIED";
}

// 種別に対応する残高列。付与・取消の両方がこの対応表を使う。
export function resolveBalanceColumnForType(entitlementType: string): "kokudaka" | "gacha_tickets" | null {
  if (!isApplicableEntitlementType(entitlementType)) return null;
  return ENTITLEMENT_BALANCE_COLUMN[entitlementType];
}

// 付与時の残高列。適用対象でなければ null。
export function resolveBalanceColumn(
  sourceSystemKey: string,
  entitlementType: string,
  allowedSourceSystemKeys: readonly string[]
): "kokudaka" | "gacha_tickets" | null {
  if (decideEntitlementApplication(sourceSystemKey, entitlementType, allowedSourceSystemKeys) !== "APPLIED") {
    return null;
  }
  return resolveBalanceColumnForType(entitlementType);
}

// 取消時に残高を戻してよいか。
//
// 根拠は「付与時に実際へ残高へ入れたか」(= application_decision)だけであり、取消の
// 時点で allowlist を再評価してはいけない。allowlist は運用で変わるため、再評価すると
//   ・未許可のまま付与 → 後から承認 → 取消     で、入れていない残高を引く
//   ・許可して付与     → 後から承認取消 → 取消 で、入れた残高を戻さない
// の両方が起きる。entitlement_type は行ごとに不変なので送信元を判定へ加えるまでは
// 問題にならなかった。SQL側の entitlement_balance_was_applied() と同じ規則。
export function wasBalanceApplied(applicationDecision: string | null): boolean {
  // 本規則の導入前に適用された行は application_decision を持たない。それらは当時の
  // 規則(種別のみ)で実際に加算されているため、戻す対象になる。
  if (applicationDecision === null) return true;
  return applicationDecision === "APPLIED";
}

// 非適用の理由。DBの application_decision_reason と同じ文言を組み立てる。
export function describeDecision(
  decision: EntitlementApplicationDecision,
  context: { sourceSystemKey: string; entitlementType: string; commonUserId?: string | null }
): string | null {
  switch (decision) {
    case "APPLIED":
      return null;
    case "SOURCE_NOT_ALLOWED":
      return `送信元 ${context.sourceSystemKey} は entitlement_source_allowlist に未登録`;
    case "TYPE_NOT_APPLICABLE":
      return `種別 ${context.entitlementType} は残高への実効果を持たない`;
    case "USER_UNRESOLVED":
      return `common_user_id=${context.commonUserId ?? ""} をローカルユーザーへ解決できない`;
    case "DISMISSED":
      return "運用が再解決を却下済み";
  }
}
