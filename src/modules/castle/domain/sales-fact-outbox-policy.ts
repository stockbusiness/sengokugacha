// Passport実装指示書 PR-P1c。販売事実Outboxの生成・配送フラグ(C1回答 修正指示6)。
//
// 生成と配送を分ける。配送をOFFにしても、生成済みのOutboxは保持される。Agencyの受信
// 契約が完了するまで配送はOFFのままにする。
//
// 旧報酬計上(commission_write_settings)とは別テーブル・別フラグ。販売事実の記録を
// 始めても、Passportの旧報酬計上が再開することはない。

export type SalesFactOutboxSettings = {
  generationEnabled: boolean;
  deliveryEnabled: boolean;
};

// 行が無い場合の既定値。両方OFF。
export const DEFAULT_SALES_FACT_OUTBOX_SETTINGS: SalesFactOutboxSettings = {
  generationEnabled: false,
  deliveryEnabled: false,
};

// PR-P1bのcommission側と同じ考え方。設定テーブルのフラグだけで配送が始まると、DBを
// 直接触れる者の操作ミス1つでAgencyへイベントが飛び始めてしまう。コード側にもう1枚
// ゲートを置き、両方が揃わないと配送しない。
//
// 生成にはこのゲートを掛けない。生成は外部への影響が無く(自DBに行が増えるだけ)、
// 記録を始めるのが早い分には販売事実を取りこぼさずに済むため。
export const SALES_FACT_DELIVERY_ALLOWED = false;

export function resolveEffectiveSalesFactOutboxSettings(
  dbSettings: SalesFactOutboxSettings,
  deliveryAllowed: boolean = SALES_FACT_DELIVERY_ALLOWED
): SalesFactOutboxSettings {
  return {
    generationEnabled: dbSettings.generationEnabled,
    deliveryEnabled: deliveryAllowed && dbSettings.deliveryEnabled,
  };
}

export function shouldRecordSalesFact(settings: SalesFactOutboxSettings): boolean {
  return settings.generationEnabled;
}

export function shouldDeliverSalesFact(settings: SalesFactOutboxSettings): boolean {
  return settings.deliveryEnabled;
}
