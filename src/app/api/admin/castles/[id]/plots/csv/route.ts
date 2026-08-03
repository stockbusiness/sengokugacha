import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { getPlotsForCastle, importPlotsFromCsv, PlotCsvImportRejectedError } from "@/lib/castle-plots";
import { parseCsvWithHeader, toCell, toCsv } from "@/lib/csv";
import { parsePlotCsvRecords, PLOT_CSV_HEADER, PLOT_CSV_SAMPLE_ROWS } from "@/modules/castle/domain/castle-csv";

function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// 城1件分の区画をCSVで出力する。取り込みと同じ列・同じ順序。
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?sample=1 は記入例(城の指定に依らず同じ内容を返す)。
  if (request.nextUrl.searchParams.get("sample") === "1") {
    return csvResponse(toCsv([...PLOT_CSV_HEADER], PLOT_CSV_SAMPLE_ROWS), "castle_plots_sample.csv");
  }

  const { id } = await params;
  const plots = await getPlotsForCastle(id);
  const rows = plots.map((plot) => [
    plot.id,
    plot.plot_code,
    plot.name,
    toCell(plot.block_label),
    toCell(plot.price_yen),
    plot.status,
    toCell(plot.display_order),
    toCell(plot.description),
    toCell(plot.main_image_url),
  ]);

  return csvResponse(
    toCsv([...PLOT_CSV_HEADER], rows),
    `castle_plots_${id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`
  );
}

// 区画のCSV取り込み。既存の「下書き区画をまとめて作成」が連番+同一価格しか作れないのに対し、
// 実測量データのように区画ごとに名称・街区・価格が異なるものを投入できるようにする。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const text = await request.text();
  if (text.trim().length === 0) {
    return NextResponse.json({ error: "CSVが空です。" }, { status: 400 });
  }

  const { header, records } = parseCsvWithHeader(text);
  if (!header.includes("plot_code")) {
    return NextResponse.json(
      { error: "ヘッダー行に plot_code 列がありません。エクスポートしたCSVの1行目をそのまま使ってください。" },
      { status: 400 }
    );
  }
  if (records.length === 0) {
    return NextResponse.json({ error: "データ行がありません。" }, { status: 400 });
  }

  const { rows, errors } = parsePlotCsvRecords(records);
  if (errors.length > 0) {
    return NextResponse.json({ error: "入力に誤りがあります。修正して取り込み直してください。", errors }, { status: 400 });
  }

  try {
    const result = await importPlotsFromCsv(id, rows, await getAdminActorName());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlotCsvImportRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("区画のCSV取り込みに失敗しました", error);
    return NextResponse.json({ error: "取り込みに失敗しました。" }, { status: 500 });
  }
}
