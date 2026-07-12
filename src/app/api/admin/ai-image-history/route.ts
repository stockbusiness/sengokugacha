import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 全件集計はしない(件数が増えたときのフルスキャンを避けるため)。直近N件を対象にした
// 簡易な集計・一覧にとどめる。金額(コスト)はモデル・サイズで単価が変わり不正確になりやすいため、
// 件数のみを表示する。
const HISTORY_LIMIT = 200;

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_generated_images")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const byProvider: Record<string, number> = {};
  const byEntityType: Record<string, number> = {};
  let adopted = 0;
  for (const row of rows) {
    byProvider[row.provider as string] = (byProvider[row.provider as string] ?? 0) + 1;
    byEntityType[row.entity_type as string] = (byEntityType[row.entity_type as string] ?? 0) + 1;
    if (row.adopted) adopted++;
  }

  return NextResponse.json({
    summary: { total: rows.length, adopted, byProvider, byEntityType, limit: HISTORY_LIMIT },
    rows,
  });
}
