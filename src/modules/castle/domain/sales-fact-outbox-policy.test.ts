import { describe, expect, it } from "vitest";
import {
  DEFAULT_SALES_FACT_OUTBOX_SETTINGS,
  SALES_FACT_DELIVERY_ALLOWED,
  resolveEffectiveSalesFactOutboxSettings,
  shouldDeliverSalesFact,
  shouldRecordSalesFact,
} from "./sales-fact-outbox-policy";

const BOTH_ON = { generationEnabled: true, deliveryEnabled: true };
const BOTH_OFF = { generationEnabled: false, deliveryEnabled: false };

describe("DEFAULT_SALES_FACT_OUTBOX_SETTINGS", () => {
  // 設定行の投入忘れが「意図せず動き出す」方向へ働かないようにする。
  it("設定行が無いときは生成も配送もしない", () => {
    expect(DEFAULT_SALES_FACT_OUTBOX_SETTINGS).toEqual(BOTH_OFF);
    expect(shouldRecordSalesFact(DEFAULT_SALES_FACT_OUTBOX_SETTINGS)).toBe(false);
    expect(shouldDeliverSalesFact(DEFAULT_SALES_FACT_OUTBOX_SETTINGS)).toBe(false);
  });
});

describe("resolveEffectiveSalesFactOutboxSettings", () => {
  // 生成と配送を分ける(C1回答 修正指示6)。
  it("生成ONでも配送は別のフラグで決まる", () => {
    const settings = resolveEffectiveSalesFactOutboxSettings(
      { generationEnabled: true, deliveryEnabled: false },
      true
    );
    expect(shouldRecordSalesFact(settings)).toBe(true);
    expect(shouldDeliverSalesFact(settings)).toBe(false);
  });

  it("配送ONでも生成OFFなら記録しない", () => {
    const settings = resolveEffectiveSalesFactOutboxSettings(
      { generationEnabled: false, deliveryEnabled: true },
      true
    );
    expect(shouldRecordSalesFact(settings)).toBe(false);
  });

  // コード側ゲート。DBだけでAgencyへイベントが飛び始めないようにする。
  it("コード側ゲートが閉じている限り、DBがtrueでも配送しない", () => {
    const settings = resolveEffectiveSalesFactOutboxSettings(BOTH_ON, false);
    expect(shouldDeliverSalesFact(settings)).toBe(false);
  });

  // 生成にはゲートを掛けない。外部への影響が無く、記録は早いほど取りこぼさない。
  it("コード側ゲートが閉じていても生成は止めない", () => {
    const settings = resolveEffectiveSalesFactOutboxSettings(BOTH_ON, false);
    expect(shouldRecordSalesFact(settings)).toBe(true);
  });

  it("ゲートとDBの両方が開いて初めて配送する", () => {
    expect(shouldDeliverSalesFact(resolveEffectiveSalesFactOutboxSettings(BOTH_ON, true))).toBe(true);
  });

  // 現在の出荷状態。Agency受信契約が完了するまでここは閉じたまま。
  it("既定ではコード側ゲートが閉じている", () => {
    expect(SALES_FACT_DELIVERY_ALLOWED).toBe(false);
    expect(shouldDeliverSalesFact(resolveEffectiveSalesFactOutboxSettings(BOTH_ON))).toBe(false);
  });
});
