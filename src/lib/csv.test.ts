import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvWithHeader, toCell, toCsv } from "./csv";

describe("parseCsv", () => {
  it("単純なカンマ区切りを行と列に分解する", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("CRLF改行を扱える(Excelが書き出す形式)", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("BOM付きUTF-8の先頭バイトを値に混ぜない", () => {
    const withBom = "﻿name,price\n岐阜城,300000";
    expect(parseCsv(withBom)[0][0]).toBe("name");
  });

  it("引用符で囲まれた値の中のカンマを区切りとして扱わない", () => {
    expect(parseCsv('name,description\n岐阜城,"美濃国, 稲葉山"')).toEqual([
      ["name", "description"],
      ["岐阜城", "美濃国, 稲葉山"],
    ]);
  });

  it("引用符で囲まれた値の中の改行を行区切りとして扱わない", () => {
    const rows = parseCsv('name,description\n岐阜城,"1行目\n2行目"');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("1行目\n2行目");
  });

  it("連続する二重引用符を引用符1文字として読む", () => {
    expect(parseCsv('name\n"""天下"" 統一"')[1][0]).toBe('"天下" 統一');
  });

  it("最終行に改行が無くても取りこぼさない", () => {
    expect(parseCsv("a\n1")).toHaveLength(2);
  });

  it("全セルが空の行は無視する", () => {
    expect(parseCsv("a,b\n1,2\n\n,\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("空文字列は空配列を返す", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("parseCsvWithHeader", () => {
  it("ヘッダーを見出しにしたオブジェクトへ変換する", () => {
    const { header, records } = parseCsvWithHeader("name,price\n岐阜城,300000");
    expect(header).toEqual(["name", "price"]);
    expect(records[0].values).toEqual({ name: "岐阜城", price: "300000" });
  });

  it("ファイル上の行番号を持たせる(1行目がヘッダーなのでデータ1行目は2)", () => {
    const { records } = parseCsvWithHeader("name\nA\nB");
    expect(records.map((r) => r.lineNumber)).toEqual([2, 3]);
  });

  it("行に足りない列は空文字として扱う(Excelは末尾の空セルを省く)", () => {
    const { records } = parseCsvWithHeader("name,prefecture,region\n岐阜城");
    expect(records[0].values).toEqual({ name: "岐阜城", prefecture: "", region: "" });
  });

  it("見出しと値の前後の空白を落とす", () => {
    const { header, records } = parseCsvWithHeader(" name , price \n 岐阜城 , 300000 ");
    expect(header).toEqual(["name", "price"]);
    expect(records[0].values.name).toBe("岐阜城");
  });

  it("ヘッダーだけのファイルはレコード0件になる", () => {
    const { records } = parseCsvWithHeader("name,price");
    expect(records).toEqual([]);
  });
});

describe("toCsv", () => {
  it("BOM付き・CRLF改行で書き出す", () => {
    const csv = toCsv(["a"], [["1"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿a\r\n1\r\n");
  });

  it("カンマ・引用符・改行を含む値だけを引用符で囲む", () => {
    const csv = toCsv(["x"], [["a,b"], ['say "hi"'], ["1\n2"], ["plain"]]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"1\n2"');
    expect(csv).toContain("\r\nplain\r\n");
  });

  it("書き出したものを読み戻すと元の値に一致する", () => {
    const rows = [["岐阜城", "美濃国, 稲葉山", 'a"b'], ["犬山城", "", "1\n2"]];
    const parsed = parseCsv(toCsv(["name", "description", "note"], rows));
    expect(parsed.slice(1)).toEqual(rows);
  });
});

describe("toCell", () => {
  it("nullとundefinedを空欄にする", () => {
    expect(toCell(null)).toBe("");
    expect(toCell(undefined)).toBe("");
  });

  it("数値を文字列にする。0は空欄にしない", () => {
    expect(toCell(0)).toBe("0");
    expect(toCell(300000)).toBe("300000");
  });
});
