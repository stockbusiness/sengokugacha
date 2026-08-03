// CSVの読み書き。管理画面のマスタ取り込み・エクスポートから使う。
// 外部依存を増やさないため自前実装にしているが、Excelが書き出すCSVを読めることを
// 要件とするため、RFC4180のクォート規則(引用符で囲まれた値の中のカンマ・改行・
// 二重引用符のエスケープ)には対応する。

// 1行を「カンマ区切りの文字列の配列」として持つ。値の型変換は呼び出し側で行う。
export type CsvRow = string[];

const BOM = "﻿";

// Excelは日本語CSVをUTF-8と判定できずBOM無しだと文字化けするため、書き出し時は必ず付ける。
// 読み込み時は付いていても付いていなくても受け付ける。
function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

// 引用符で囲まれた値の中にカンマや改行が入りうるため、行で単純分割はできない。
// 1文字ずつ走査して状態(引用符の中かどうか)を持つ。
export function parseCsv(text: string): CsvRow[] {
  const source = stripBom(text);
  const rows: CsvRow[] = [];
  let row: CsvRow = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  function endField() {
    row.push(field);
    field = "";
  }

  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < source.length) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        // 連続する二重引用符は、値としての引用符1文字を表す(RFC4180)。
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      // CRLFのCRは読み飛ばし、続くLFで行を終える。単独のCRも行区切りとして扱う。
      if (source[i + 1] === "\n") {
        endRow();
        i += 2;
      } else {
        endRow();
        i += 1;
      }
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // 最終行に改行が無い場合の取りこぼしを防ぐ。逆に末尾が改行だった場合は
  // 空行が1つ増えるため、下の空行除去で落とす。
  if (field.length > 0 || row.length > 0) endRow();

  // 全セルが空の行は、末尾の改行や編集時の空行なので無視する。
  return rows.filter((r) => r.some((cell) => cell.length > 0));
}

// ヘッダー行を見出しとして、各行を「見出し→値」のオブジェクトに変換する。
// 見出しに無い列は無視し、行に足りない列は空文字として扱う(Excelは末尾の空セルを省くため)。
export type CsvRecord = { lineNumber: number; values: Record<string, string> };

export function parseCsvWithHeader(text: string): { header: string[]; records: CsvRecord[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { header: [], records: [] };

  const header = rows[0].map((cell) => cell.trim());
  const records = rows.slice(1).map((row, index) => {
    const values: Record<string, string> = {};
    header.forEach((key, columnIndex) => {
      values[key] = (row[columnIndex] ?? "").trim();
    });
    // 1行目がヘッダーなので、データ1行目はファイル上の2行目にあたる。
    // エラー表示でユーザーが該当行を探せるよう、ファイル上の行番号を持たせる。
    return { lineNumber: index + 2, values };
  });

  return { header, records };
}

function escapeCell(value: string): string {
  // カンマ・引用符・改行のいずれかを含む値だけを引用符で囲む(不要な引用符で
  // 差分が膨らむのを避けるため)。
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Excelで開くことを前提に、BOM付きUTF-8・CRLF改行で書き出す。
export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

// null/undefined/数値をCSVのセル値に落とす。nullと空文字は区別せず空欄にする。
export function toCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}
