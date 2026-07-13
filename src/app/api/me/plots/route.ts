import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 要件書11.4「土地所有者マイページ」。
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_plots")
    .select("id, castle_id, plot_code, name, price_yen, sold_price_yen, sold_at, castles:castle_id(name)")
    .eq("owner_user_id", session.userId)
    .order("sold_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
