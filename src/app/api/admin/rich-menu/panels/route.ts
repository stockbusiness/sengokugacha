import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { RICH_MENU_BUTTONS } from "@/lib/rich-menu";
import { DEFAULT_PANEL_SLUGS } from "@/lib/rich-menu-compose";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("rich_menu_panels").select("slot_index, source_image_url, updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bySlot = new Map((data ?? []).map((row) => [row.slot_index, row]));

  const panels = RICH_MENU_BUTTONS.map((button, i) => ({
    slotIndex: i,
    label: button.label,
    imageUrl: bySlot.get(i)?.source_image_url ?? `/rich-menu-panels/${DEFAULT_PANEL_SLUGS[i]}.webp`,
    isCustomized: bySlot.has(i),
    updatedAt: bySlot.get(i)?.updated_at ?? null,
  }));

  return NextResponse.json({ panels });
}
