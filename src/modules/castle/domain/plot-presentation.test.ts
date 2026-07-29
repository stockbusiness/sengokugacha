import { describe, expect, it } from "vitest";
import {
  getPlotStatusPresentation,
  groupPlotsByBlock,
  summarizePlotScarcity,
} from "./plot-presentation";

describe("getPlotStatusPresentation", () => {
  it("販売中は減光せず、availableトーンで表示する", () => {
    expect(getPlotStatusPresentation("available")).toEqual({ label: "販売中", tone: "available", dimmed: false });
  });

  it("販売済み・取消・一時停止は減光する", () => {
    expect(getPlotStatusPresentation("sold").dimmed).toBe(true);
    expect(getPlotStatusPresentation("cancelled").dimmed).toBe(true);
    expect(getPlotStatusPresentation("suspended").dimmed).toBe(true);
  });

  it("予約中・審査中・入金待ちは販売機会が残るため減光しない", () => {
    expect(getPlotStatusPresentation("reserved").dimmed).toBe(false);
    expect(getPlotStatusPresentation("application_pending").tone).toBe("pending");
    expect(getPlotStatusPresentation("payment_pending").tone).toBe("pending");
  });

  it("未知のstatusでも落ちずにフォールバックする", () => {
    expect(getPlotStatusPresentation("brand_new_status")).toEqual({
      label: "brand_new_status",
      tone: "inactive",
      dimmed: true,
    });
  });
});

describe("summarizePlotScarcity", () => {
  it("区画が無い場合は全て0を返し、ゼロ除算しない", () => {
    const summary = summarizePlotScarcity([]);
    expect(summary.total).toBe(0);
    expect(summary.soldPercent).toBe(0);
    expect(summary.minAvailablePriceYen).toBeNull();
    expect(summary.isLowStock).toBe(false);
  });

  it("販売中の最低価格を返す", () => {
    const summary = summarizePlotScarcity([
      { price_yen: 300000, status: "available" },
      { price_yen: 100000, status: "available" },
      // 販売済みの方が安くても、購入可能な最低価格には含めない
      { price_yen: 50000, status: "sold" },
    ]);
    expect(summary.minAvailablePriceYen).toBe(100000);
  });

  it("取消・一時停止は在庫の分母から除外する", () => {
    const summary = summarizePlotScarcity([
      { price_yen: 100, status: "available" },
      { price_yen: 100, status: "sold" },
      { price_yen: 100, status: "cancelled" },
      { price_yen: 100, status: "suspended" },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.soldPercent).toBe(50);
  });

  it("予約中・審査中・入金待ちをpendingとして数える", () => {
    const summary = summarizePlotScarcity([
      { price_yen: 100, status: "available" },
      { price_yen: 100, status: "reserved" },
      { price_yen: 100, status: "application_pending" },
      { price_yen: 100, status: "payment_pending" },
      { price_yen: 100, status: "sold" },
    ]);
    expect(summary.availableCount).toBe(1);
    expect(summary.soldCount).toBe(1);
    expect(summary.pendingCount).toBe(3);
  });

  it("販売中が全体の20%以下なら残り僅かと判定する", () => {
    const plots = Array.from({ length: 10 }, (_, index) => ({
      price_yen: 100,
      status: index < 2 ? "available" : "sold",
    }));
    expect(summarizePlotScarcity(plots).isLowStock).toBe(true);
  });

  it("販売中が20%を超えるなら残り僅かとしない", () => {
    const plots = Array.from({ length: 10 }, (_, index) => ({
      price_yen: 100,
      status: index < 3 ? "available" : "sold",
    }));
    expect(summarizePlotScarcity(plots).isLowStock).toBe(false);
  });

  it("完売時は残り僅かとしない(煽る対象が無いため)", () => {
    const summary = summarizePlotScarcity([{ price_yen: 100, status: "sold" }]);
    expect(summary.isLowStock).toBe(false);
    expect(summary.soldPercent).toBe(100);
  });
});

describe("groupPlotsByBlock", () => {
  it("街区が1種類だけならグルーピングしない", () => {
    const plots = [
      { id: "1", block_label: "北街区" },
      { id: "2", block_label: "北街区" },
    ];
    const groups = groupPlotsByBlock(plots);
    expect(groups).toHaveLength(1);
    expect(groups[0].blockLabel).toBeNull();
    expect(groups[0].plots).toHaveLength(2);
  });

  it("街区が全てnullでもグルーピングしない", () => {
    const groups = groupPlotsByBlock([{ id: "1" }, { id: "2", block_label: null }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].blockLabel).toBeNull();
  });

  it("複数街区があれば出現順にグルーピングする", () => {
    const groups = groupPlotsByBlock([
      { id: "1", block_label: "北街区" },
      { id: "2", block_label: "南街区" },
      { id: "3", block_label: "北街区" },
    ]);
    expect(groups.map((group) => group.blockLabel)).toEqual(["北街区", "南街区"]);
    expect(groups[0].plots.map((plot) => plot.id)).toEqual(["1", "3"]);
    expect(groups[1].plots.map((plot) => plot.id)).toEqual(["2"]);
  });

  it("街区ありとnullが混在する場合もnullを1グループとして扱う", () => {
    const groups = groupPlotsByBlock([
      { id: "1", block_label: "北街区" },
      { id: "2", block_label: null },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1].blockLabel).toBeNull();
  });
});
