// Passport実装指示書 PR-P2a「Entitlement適用範囲の制限」+ PR-P2b「商品所有者マップ」。
//
// Passportがローカル残高へ適用してよい権利を、明示的な allowlist で表す。
// 判定の正本はSQL関数 entitlement_application_decision() で、ここはその同じ規則を
// TypeScript側から参照・検証できるようにしたもの。
import { expectedEntitlementTypeFor, isProductCodeProvided } from "./product-ownership";

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
  | "PRODUCT_CODE_REQUIRED"
  | "PRODUCT_NOT_OWNED"
  | "PRODUCT_TYPE_MISMATCH"
  | "TYPE_NOT_APPLICABLE"
  | "USER_UNRESOLVED"
  | "DISMISSED";

export function isApplicableEntitlementType(entitlementType: string): entitlementType is ApplicableEntitlementType {
  return (APPLICABLE_ENTITLEMENT_TYPES as readonly string[]).includes(entitlementType);
}

// 残高へ適用してよいかの唯一の判定口。判定順序はここにだけ存在する(PR-P2b)。
//
//   1. 送信元が allowlist にあるか        → SOURCE_NOT_ALLOWED
//   2. 商品コードが送られているか          → PRODUCT_CODE_REQUIRED
//   3. 商品コードが Passport の担当か      → PRODUCT_NOT_OWNED
//   4. 商品コードと種別が一致するか        → PRODUCT_TYPE_MISMATCH
//   5. 残高適用対象の種別か                → TYPE_NOT_APPLICABLE
//   6. すべて通過                          → APPLIED
//
// 順序に意味がある。送信元が不許可なら商品を見るまでもないし、担当外の商品に
// 「種別が対象外」と返す必要もない。
//
// allowedSourceSystemKeys は entitlement_source_allowlist の内容。既定は空で、
// その場合はどの送信元からも適用しない。
export function decideEntitlementApplication(
  sourceSystemKey: string,
  productCode: string | null | undefined,
  entitlementType: string,
  allowedSourceSystemKeys: readonly string[]
): EntitlementApplicationDecision {
  if (!allowedSourceSystemKeys.includes(sourceSystemKey)) return "SOURCE_NOT_ALLOWED";
  if (!isProductCodeProvided(productCode)) return "PRODUCT_CODE_REQUIRED";

  const expectedType = expectedEntitlementTypeFor(productCode);
  if (expectedType === null) return "PRODUCT_NOT_OWNED";
  if (expectedType !== entitlementType) return "PRODUCT_TYPE_MISMATCH";

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
  productCode: string | null | undefined,
  entitlementType: string,
  allowedSourceSystemKeys: readonly string[]
): "kokudaka" | "gacha_tickets" | null {
  if (decideEntitlementApplication(sourceSystemKey, productCode, entitlementType, allowedSourceSystemKeys) !== "APPLIED") {
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
  context: {
    sourceSystemKey: string;
    entitlementType: string;
    productCode?: string | null;
    commonUserId?: string | null;
  }
): string | null {
  switch (decision) {
    case "APPLIED":
      return null;
    case "SOURCE_NOT_ALLOWED":
      return `送信元 ${context.sourceSystemKey} は entitlement_source_allowlist に未登録`;
    case "PRODUCT_CODE_REQUIRED":
      return "product_code が未指定。承認済み送信元は商品コードの送付が必須";
    case "PRODUCT_NOT_OWNED":
      return `商品コード ${context.productCode ?? ""} は Passport の担当商品ではない`;
    case "PRODUCT_TYPE_MISMATCH":
      return `商品コード ${context.productCode ?? ""} と種別 ${context.entitlementType} の組み合わせが不正`;
    case "TYPE_NOT_APPLICABLE":
      return `種別 ${context.entitlementType} は残高への実効果を持たない`;
    case "USER_UNRESOLVED":
      return `common_user_id=${context.commonUserId ?? ""} をローカルユーザーへ解決できない`;
    case "DISMISSED":
      return "運用が再解決を却下済み";
  }
}
