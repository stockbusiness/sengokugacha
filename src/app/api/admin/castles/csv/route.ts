import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { CsvImportRejectedError, getAllCastlesForAdmin, importCastlesFromCsv } from "@/lib/castles";
import { parseCsvWithHeader, toCell, toCsv } from "@/lib/csv";
import { CASTLE_CSV_HEADER, parseCastleCsvRecords } from "@/modules/castle/domain/castle-csv";

// 城マスタのCSVエクスポート。取り込みと同じ列・同じ順序で出力するため、
// 出力したものを編集してそのまま取り込み直せる(idが入っているので更新になる)。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const castles = await getAllCastlesForAdmin();
  const rows = castles.map((castle) => [
    castle.id,
    castle.name,
    toCell(castle.prefecture),
    toCell(castle.region),
    castle.status,
    castle.unlock_level,
    castle.historical_review_status,
    toCell(castle.display_order),
    toCell(castle.lord_plan_price_yen),
    toCell(castle.description),
    toCell(castle.historical_lord_summary),
    toCell(castle.main_image_url),
  ]);

  const csv = toCsv([...CASTLE_CSV_HEADER], rows);
  const filename = `castles_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// 城マスタのCSV取り込み。1行でも不正があれば何も書き込まず、全ての不正行を返す
// (部分的に反映されると、どこまで入ったのか管理者が追えなくなるため)。
export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const text = await request.text();
  if (text.trim().length === 0) {
    return NextResponse.json({ error: "CSVが空です。" }, { status: 400 });
  }

  const { header, records } = parseCsvWithHeader(text);
  if (!header.includes("name")) {
    return NextResponse.json(
      { error: "ヘッダー行に name 列がありません。エクスポートしたCSVの1行目をそのまま使ってください。" },
      { status: 400 }
    );
  }
  if (records.length === 0) {
    return NextResponse.json({ error: "データ行がありません。" }, { status: 400 });
  }

  const { rows, errors } = parseCastleCsvRecords(records);
  if (errors.length > 0) {
    return NextResponse.json({ error: "入力に誤りがあります。修正して取り込み直してください。", errors }, { status: 400 });
  }

  try {
    const result = await importCastlesFromCsv(rows, await getAdminActorName());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CsvImportRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("城マスタのCSV取り込みに失敗しました", error);
    return NextResponse.json({ error: "取り込みに失敗しました。" }, { status: 500 });
  }
}
