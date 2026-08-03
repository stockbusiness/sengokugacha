// 城マスタ・区画のCSV取り込みの検証とマッピング。DB非依存の純粋関数だけを置く。
// 取り込みは「1行でも不正があれば全体を適用しない」方針とし、この層は不正行の
// 一覧を返すところまでを担う(部分的に適用されると、どこまで反映されたのか
// 管理者が追えなくなるため)。

export type CsvImportError = { lineNumber: number; column: string; message: string };

export type ParsedImport<T> = { rows: T[]; errors: CsvImportError[] };

const CASTLE_STATUSES = ["draft", "recruiting", "published", "hidden"] as const;
const UNLOCK_LEVELS = ["PUBLIC", "PROVINCE_CONQUEST_REQUIRED", "REGION_CONQUEST_REQUIRED", "UNPUBLISHED"] as const;
const REVIEW_STATUSES = ["unreviewed", "reviewed"] as const;

export const CASTLE_CSV_HEADER = [
  "id",
  "name",
  "prefecture",
  "region",
  "status",
  "unlock_level",
  "historical_review_status",
  "display_order",
  "lord_plan_price_yen",
  "description",
  "historical_lord_summary",
  "main_image_url",
] as const;

export type CastleCsvRow = {
  lineNumber: number;
  // 空欄なら新規作成。値があれば既存行の更新。
  id: string | null;
  name: string;
  prefecture: string | null;
  region: string | null;
  status: (typeof CASTLE_STATUSES)[number];
  unlock_level: (typeof UNLOCK_LEVELS)[number];
  historical_review_status: (typeof REVIEW_STATUSES)[number];
  display_order: number;
  lord_plan_price_yen: number | null;
  description: string | null;
  historical_lord_summary: string | null;
  main_image_url: string | null;
};

// 空欄はnull(未設定)として扱う。空文字とnullを区別しない。
function optionalText(value: string): string | null {
  return value.length > 0 ? value : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readId(value: string, lineNumber: number, errors: CsvImportError[]): string | null {
  if (value.length === 0) return null;
  if (!UUID_PATTERN.test(value)) {
    errors.push({
      lineNumber,
      column: "id",
      message: "idの形式が正しくありません。新規作成したい場合は空欄にしてください。",
    });
    return null;
  }
  return value;
}

function readChoice<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
  column: string,
  lineNumber: number,
  errors: CsvImportError[]
): T {
  if (value.length === 0) return fallback;
  if (!(allowed as readonly string[]).includes(value)) {
    errors.push({
      lineNumber,
      column,
      message: `「${value}」は指定できません。${allowed.join(" / ")} のいずれかを入力してください。`,
    });
    return fallback;
  }
  return value as T;
}

// 空欄は「未設定」を意味するのでnullを返す。0は有効な入力なので空欄と区別する。
function readOptionalInteger(
  value: string,
  column: string,
  lineNumber: number,
  errors: CsvImportError[]
): number | null {
  if (value.length === 0) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    errors.push({ lineNumber, column, message: `「${value}」は0以上の整数で入力してください。` });
    return null;
  }
  return parsed;
}

export function parseCastleCsvRecords(
  records: { lineNumber: number; values: Record<string, string> }[]
): ParsedImport<CastleCsvRow> {
  const errors: CsvImportError[] = [];
  const rows: CastleCsvRow[] = [];
  const seenIds = new Set<string>();

  for (const record of records) {
    const { lineNumber, values } = record;
    const name = (values.name ?? "").trim();
    if (name.length === 0) {
      errors.push({ lineNumber, column: "name", message: "城名は必須です。" });
    }

    const id = readId(values.id ?? "", lineNumber, errors);
    if (id) {
      // 同じidが複数行にあると、どちらが最終値になるかが取り込み順に依存してしまう。
      if (seenIds.has(id)) {
        errors.push({ lineNumber, column: "id", message: "同じidが複数の行にあります。" });
      }
      seenIds.add(id);
    }

    rows.push({
      lineNumber,
      id,
      name,
      prefecture: optionalText(values.prefecture ?? ""),
      region: optionalText(values.region ?? ""),
      status: readChoice(values.status ?? "", CASTLE_STATUSES, "draft", "status", lineNumber, errors),
      unlock_level: readChoice(values.unlock_level ?? "", UNLOCK_LEVELS, "PUBLIC", "unlock_level", lineNumber, errors),
      historical_review_status: readChoice(
        values.historical_review_status ?? "",
        REVIEW_STATUSES,
        "unreviewed",
        "historical_review_status",
        lineNumber,
        errors
      ),
      display_order: readOptionalInteger(values.display_order ?? "", "display_order", lineNumber, errors) ?? 0,
      lord_plan_price_yen: readOptionalInteger(
        values.lord_plan_price_yen ?? "",
        "lord_plan_price_yen",
        lineNumber,
        errors
      ),
      description: optionalText(values.description ?? ""),
      historical_lord_summary: optionalText(values.historical_lord_summary ?? ""),
      main_image_url: optionalText(values.main_image_url ?? ""),
    });
  }

  return { rows, errors };
}

// ============================================================
// 区画(castle_plots)
// ============================================================

const PLOT_STATUSES = [
  "draft",
  "available",
  "reserved",
  "application_pending",
  "payment_pending",
  "sold",
  "cancelled",
  "suspended",
] as const;

export const PLOT_CSV_HEADER = [
  "id",
  "plot_code",
  "name",
  "block_label",
  "price_yen",
  "status",
  "display_order",
  "description",
  "main_image_url",
] as const;

export type PlotCsvRow = {
  lineNumber: number;
  id: string | null;
  plot_code: string;
  name: string;
  block_label: string | null;
  price_yen: number;
  status: (typeof PLOT_STATUSES)[number];
  display_order: number;
  description: string | null;
  main_image_url: string | null;
};

// 取り込みで変更してよい状態を限定する。予約・入金待ち・販売済みの区画をCSVで
// 書き換えると、進行中の取引や成約済みの記録を壊しうるため、取り込み側では
// これらへの変更を受け付けない(管理画面の個別操作で行う)。
export const PLOT_CSV_ASSIGNABLE_STATUSES = ["draft", "available", "cancelled", "suspended"] as const;

export function parsePlotCsvRecords(
  records: { lineNumber: number; values: Record<string, string> }[]
): ParsedImport<PlotCsvRow> {
  const errors: CsvImportError[] = [];
  const rows: PlotCsvRow[] = [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();

  for (const record of records) {
    const { lineNumber, values } = record;

    const plotCode = (values.plot_code ?? "").trim();
    if (plotCode.length === 0) {
      errors.push({ lineNumber, column: "plot_code", message: "区画コードは必須です。" });
    } else if (seenCodes.has(plotCode)) {
      errors.push({ lineNumber, column: "plot_code", message: "同じ区画コードが複数の行にあります。" });
    }
    seenCodes.add(plotCode);

    const name = (values.name ?? "").trim();
    if (name.length === 0) {
      errors.push({ lineNumber, column: "name", message: "区画名は必須です。" });
    }

    const id = readId(values.id ?? "", lineNumber, errors);
    if (id) {
      if (seenIds.has(id)) {
        errors.push({ lineNumber, column: "id", message: "同じidが複数の行にあります。" });
      }
      seenIds.add(id);
    }

    const priceYen = readOptionalInteger(values.price_yen ?? "", "price_yen", lineNumber, errors);
    if (priceYen === null && (values.price_yen ?? "").length === 0) {
      errors.push({ lineNumber, column: "price_yen", message: "価格は必須です。" });
    }

    const status = readChoice(values.status ?? "", PLOT_STATUSES, "draft", "status", lineNumber, errors);
    if (
      (values.status ?? "").length > 0 &&
      (PLOT_STATUSES as readonly string[]).includes(values.status) &&
      !(PLOT_CSV_ASSIGNABLE_STATUSES as readonly string[]).includes(status)
    ) {
      errors.push({
        lineNumber,
        column: "status",
        message: `「${status}」はCSV取り込みでは指定できません。進行中の取引や成約記録を壊さないため、${PLOT_CSV_ASSIGNABLE_STATUSES.join(" / ")} のみ指定できます。`,
      });
    }

    rows.push({
      lineNumber,
      id,
      plot_code: plotCode,
      name,
      block_label: optionalText(values.block_label ?? ""),
      price_yen: priceYen ?? 0,
      status,
      display_order: readOptionalInteger(values.display_order ?? "", "display_order", lineNumber, errors) ?? 0,
      description: optionalText(values.description ?? ""),
      main_image_url: optionalText(values.main_image_url ?? ""),
    });
  }

  return { rows, errors };
}
