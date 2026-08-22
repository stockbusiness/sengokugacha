// Passport実装指示書 PR-P2b「商品所有者マップ」。Q5(案b)・Q6(商品コード条件)。
//
// Q5 のご判断により、5システム共通の商品台帳DBは作らない。各システムが自分の担当商品を
// ローカルで管理し、Passport を全システムの正本にはしない。
//
// したがってここに持つのは「Passport 自身が担当する商品」だけ。他システムの担当商品
// (戦国マーケットの評議員権・会員権、NFT作品マーケットのクリエイター作品・作品シリアル等)は
// 判定にもテーブルにも持たない。持つと事実上の正本になってしまう。

// Passport が担当する商品コードと、それぞれが取りうる entitlement_type。
//
// この1つの対応表で2つの問いに答える。
//   ・所有しているか       → 引けるかどうか
//   ・種別と一致するか     → 引いた値が entitlement_type と等しいかどうか
// 所有リストと対応表を別々に持つと、片方だけ直したときにずれる。
//
// tenka_pass / castle_lord_plan は purchases.item_type には実在するが、Q5 のご判断により
// 商品所有者マップへは追加しない。販売商品・プランとしての性格が強く、所有システムと
// 権利内容が未確定のため。将来イベント連携が必要になった時点で別途決定する。
export const PASSPORT_PRODUCT_CODES = {
  SPPT_KOKUDAKA: "kokudaka",
  SPPT_GACHA_TICKET: "gacha_ticket",
  SPPT_LAND_PLOT: "land_plot",
} as const;

export type PassportProductCode = keyof typeof PASSPORT_PRODUCT_CODES;

// 商品コードが実質的に送られてきているか。
//
// null・空文字・空白のみは「送っていない」と扱う。空白の除去はこの判定にだけ使い、
// コードの照合には一切使わない(下記 expectedEntitlementTypeFor を参照)。
export function isProductCodeProvided(productCode: string | null | undefined): productCode is string {
  return typeof productCode === "string" && productCode.trim() !== "";
}

// 商品コードに対応する entitlement_type。Passport の担当でなければ null。
//
// 完全一致のみ。ご指定の形式要件により、
//   ・前後空白を許可しない  → " SPPT_KOKUDAKA " は trim して救済せず、非所有とする
//   ・大文字小文字を自動変換しない → "sppt_kokudaka" も非所有とする
// 救済すると「正しいコードに近い文字列」の範囲が曖昧になり、所有者チェックが緩む。
export function expectedEntitlementTypeFor(productCode: string): string | null {
  return Object.prototype.hasOwnProperty.call(PASSPORT_PRODUCT_CODES, productCode)
    ? PASSPORT_PRODUCT_CODES[productCode as PassportProductCode]
    : null;
}

export function isPassportOwnedProduct(productCode: string): boolean {
  return expectedEntitlementTypeFor(productCode) !== null;
}
