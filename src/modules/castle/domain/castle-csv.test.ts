import { describe, expect, it } from "vitest";
import { parseCsvWithHeader, toCell, toCsv } from "@/lib/csv";
import {
  CASTLE_CSV_HEADER,
  CASTLE_CSV_SAMPLE_ROWS,
  parseCastleCsvRecords,
  parsePlotCsvRecords,
  PLOT_CSV_HEADER,
  PLOT_CSV_SAMPLE_ROWS,
} from "./castle-csv";

function record(lineNumber: number, values: Record<string, string>) {
  return { lineNumber, values };
}

const VALID_UUID = "11111111-2222-3333-4444-555555555555";

describe("parseCastleCsvRecords", () => {
  it("最小限の行(城名のみ)を既定値で取り込める", () => {
    const { rows, errors } = parseCastleCsvRecords([record(2, { name: "岐阜城" })]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      id: null,
      name: "岐阜城",
      status: "draft",
      unlock_level: "PUBLIC",
      historical_review_status: "unreviewed",
      display_order: 0,
      lord_plan_price_yen: null,
    });
  });

  it("城名が空ならエラーにする", () => {
    const { errors } = parseCastleCsvRecords([record(2, { name: "  " })]);
    expect(errors).toEqual([{ lineNumber: 2, column: "name", message: "城名は必須です。" }]);
  });

  it("idが空欄なら新規作成として扱う", () => {
    const { rows, errors } = parseCastleCsvRecords([record(2, { name: "岐阜城", id: "" })]);
    expect(errors).toEqual([]);
    expect(rows[0].id).toBeNull();
  });

  it("idがUUID形式でなければエラーにする", () => {
    const { errors } = parseCastleCsvRecords([record(2, { name: "岐阜城", id: "abc" })]);
    expect(errors[0]).toMatchObject({ lineNumber: 2, column: "id" });
  });

  it("同じidが複数行にあればエラーにする", () => {
    const { errors } = parseCastleCsvRecords([
      record(2, { name: "岐阜城", id: VALID_UUID }),
      record(3, { name: "犬山城", id: VALID_UUID }),
    ]);
    expect(errors).toEqual([{ lineNumber: 3, column: "id", message: "同じidが複数の行にあります。" }]);
  });

  it("statusに未定義の値が来たらエラーにする", () => {
    const { errors } = parseCastleCsvRecords([record(2, { name: "岐阜城", status: "販売中" })]);
    expect(errors[0]).toMatchObject({ lineNumber: 2, column: "status" });
  });

  it("statusが空欄ならdraftを既定にする", () => {
    const { rows, errors } = parseCastleCsvRecords([record(2, { name: "岐阜城", status: "" })]);
    expect(errors).toEqual([]);
    expect(rows[0].status).toBe("draft");
  });

  it("城主募集中(recruiting)を指定できる", () => {
    const { rows, errors } = parseCastleCsvRecords([record(2, { name: "岐阜城", status: "recruiting" })]);
    expect(errors).toEqual([]);
    expect(rows[0].status).toBe("recruiting");
  });

  it("lord_plan_price_yenの空欄はnull(共通設定を使う)にする", () => {
    const { rows } = parseCastleCsvRecords([record(2, { name: "岐阜城", lord_plan_price_yen: "" })]);
    expect(rows[0].lord_plan_price_yen).toBeNull();
  });

  it("lord_plan_price_yenの0は空欄と区別して0のまま取り込む", () => {
    const { rows, errors } = parseCastleCsvRecords([record(2, { name: "岐阜城", lord_plan_price_yen: "0" })]);
    expect(errors).toEqual([]);
    expect(rows[0].lord_plan_price_yen).toBe(0);
  });

  it("負の数や小数はエラーにする", () => {
    const { errors } = parseCastleCsvRecords([
      record(2, { name: "A", lord_plan_price_yen: "-1" }),
      record(3, { name: "B", display_order: "1.5" }),
    ]);
    expect(errors).toHaveLength(2);
  });

  it("空欄の任意項目はnullにする(空文字にしない)", () => {
    const { rows } = parseCastleCsvRecords([record(2, { name: "岐阜城", prefecture: "", description: "" })]);
    expect(rows[0].prefecture).toBeNull();
    expect(rows[0].description).toBeNull();
  });

  it("複数行のエラーをすべて集めて返す(最初の1件で止めない)", () => {
    const { errors } = parseCastleCsvRecords([
      record(2, { name: "" }),
      record(3, { name: "犬山城", status: "bogus" }),
      record(4, { name: "", unlock_level: "bogus" }),
    ]);
    expect(errors.map((e) => e.lineNumber).sort()).toEqual([2, 3, 4, 4]);
  });
});

describe("parsePlotCsvRecords", () => {
  const base = { plot_code: "GIFU-001", name: "岐阜区画1", price_yen: "300000" };

  it("必須項目が揃った行を取り込める", () => {
    const { rows, errors } = parsePlotCsvRecords([record(2, base)]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ plot_code: "GIFU-001", price_yen: 300000, status: "draft" });
  });

  it("区画コードが空ならエラーにする", () => {
    const { errors } = parsePlotCsvRecords([record(2, { ...base, plot_code: "" })]);
    expect(errors.some((e) => e.column === "plot_code")).toBe(true);
  });

  it("同じ区画コードが複数行にあればエラーにする", () => {
    const { errors } = parsePlotCsvRecords([record(2, base), record(3, base)]);
    expect(errors).toEqual([
      { lineNumber: 3, column: "plot_code", message: "同じ区画コードが複数の行にあります。" },
    ]);
  });

  it("価格が空ならエラーにする", () => {
    const { errors } = parsePlotCsvRecords([record(2, { ...base, price_yen: "" })]);
    expect(errors.some((e) => e.column === "price_yen")).toBe(true);
  });

  it("draft/available/cancelled/suspended は指定できる", () => {
    for (const status of ["draft", "available", "cancelled", "suspended"]) {
      const { errors } = parsePlotCsvRecords([record(2, { ...base, status })]);
      expect(errors).toEqual([]);
    }
  });

  it("進行中・成約済みの状態はCSVから指定できない", () => {
    for (const status of ["reserved", "application_pending", "payment_pending", "sold"]) {
      const { errors } = parsePlotCsvRecords([record(2, { ...base, status })]);
      expect(errors.some((e) => e.column === "status")).toBe(true);
    }
  });

  it("そもそも存在しない状態名もエラーにする", () => {
    const { errors } = parsePlotCsvRecords([record(2, { ...base, status: "販売中" })]);
    expect(errors.some((e) => e.column === "status")).toBe(true);
  });
});

// エクスポートしたCSVをそのまま取り込み直せること(往復)を、実際の列順で確認する。
describe("城マスタCSVの往復", () => {
  it("エクスポート形式を取り込むと元の値に戻る", () => {
    const castle = {
      id: "11111111-2222-3333-4444-555555555555",
      name: "岐阜城",
      prefecture: "岐阜県",
      region: "中部",
      status: "recruiting",
      unlock_level: "PROVINCE_CONQUEST_REQUIRED",
      historical_review_status: "reviewed",
      display_order: 3,
      lord_plan_price_yen: 3000000,
      description: "美濃国, 稲葉山に築かれた城\n織田信長の拠点",
      historical_lord_summary: '斎藤道三 → 織田信長',
      main_image_url: "castles/gifu.png",
    };
    const csv = toCsv([...CASTLE_CSV_HEADER], [[
      castle.id, castle.name, toCell(castle.prefecture), toCell(castle.region), castle.status,
      castle.unlock_level, castle.historical_review_status, toCell(castle.display_order),
      toCell(castle.lord_plan_price_yen), toCell(castle.description),
      toCell(castle.historical_lord_summary), toCell(castle.main_image_url),
    ]]);

    const { records } = parseCsvWithHeader(csv);
    const { rows, errors } = parseCastleCsvRecords(records);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(castle);
  });
});

// 記入例が仕様からずれると、それを信じて書いた利用者が必ずエラーになる。
// 配布物である以上、列の並びと検証通過をテストで固定しておく。
describe("記入例(サンプルCSV)", () => {
  it("城の記入例はヘッダーと列数が一致する", () => {
    for (const row of CASTLE_CSV_SAMPLE_ROWS) {
      expect(row).toHaveLength(CASTLE_CSV_HEADER.length);
    }
  });

  it("区画の記入例はヘッダーと列数が一致する", () => {
    for (const row of PLOT_CSV_SAMPLE_ROWS) {
      expect(row).toHaveLength(PLOT_CSV_HEADER.length);
    }
  });

  it("城の記入例はそのまま取り込める(検証エラーが出ない)", () => {
    const { records } = parseCsvWithHeader(toCsv([...CASTLE_CSV_HEADER], CASTLE_CSV_SAMPLE_ROWS));
    const { rows, errors } = parseCastleCsvRecords(records);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(CASTLE_CSV_SAMPLE_ROWS.length);
  });

  it("区画の記入例はそのまま取り込める(検証エラーが出ない)", () => {
    const { records } = parseCsvWithHeader(toCsv([...PLOT_CSV_HEADER], PLOT_CSV_SAMPLE_ROWS));
    const { rows, errors } = parsePlotCsvRecords(records);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(PLOT_CSV_SAMPLE_ROWS.length);
  });

  it("記入例は全行が新規作成(id空欄)になっている", () => {
    const idIndex = CASTLE_CSV_HEADER.indexOf("id");
    for (const row of CASTLE_CSV_SAMPLE_ROWS) expect(row[idIndex]).toBe("");
    for (const row of PLOT_CSV_SAMPLE_ROWS) expect(row[PLOT_CSV_HEADER.indexOf("id")]).toBe("");
  });

  it("記入例と分かる名前になっている(消せないため誤取り込みを識別できるように)", () => {
    const nameIndex = CASTLE_CSV_HEADER.indexOf("name");
    for (const row of CASTLE_CSV_SAMPLE_ROWS) expect(row[nameIndex]).toContain("記入例");
    for (const row of PLOT_CSV_SAMPLE_ROWS) expect(row[PLOT_CSV_HEADER.indexOf("name")]).toContain("記入例");
  });
});
