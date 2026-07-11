import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 小規模運用を前提に、DBビュー/RPCは追加せずJS側で集計する
// (既存のsrc/lib/rankings.tsと同じ方針)。

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();

  const [
    { data: events, error: eventsError },
    { data: favorites, error: favoritesError },
    { data: inquiries, error: inquiriesError },
    { data: properties, error: propertiesError },
  ] = await Promise.all([
    supabase
      .from("metaverse_view_events")
      .select("event_type, property_id")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("metaverse_favorites").select("property_id"),
    supabase.from("metaverse_inquiries").select("id, agent_id, agents(name)"),
    supabase.from("metaverse_properties").select("id, name"),
  ]);

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  if (favoritesError) return NextResponse.json({ error: favoritesError.message }, { status: 500 });
  if (inquiriesError) return NextResponse.json({ error: inquiriesError.message }, { status: 500 });
  if (propertiesError) return NextResponse.json({ error: propertiesError.message }, { status: 500 });

  const propertyNameById = new Map((properties ?? []).map((p) => [p.id, p.name]));

  const eventCountByType = new Map<string, number>();
  const detailViewCountByProperty = new Map<string, number>();
  const tourStartCountByProperty = new Map<string, number>();
  const tourCompleteCountByProperty = new Map<string, number>();

  for (const e of events ?? []) {
    eventCountByType.set(e.event_type, (eventCountByType.get(e.event_type) ?? 0) + 1);
    if (!e.property_id) continue;
    if (e.event_type === "property_detail_view") {
      detailViewCountByProperty.set(e.property_id, (detailViewCountByProperty.get(e.property_id) ?? 0) + 1);
    }
    if (e.event_type === "tour_start") {
      tourStartCountByProperty.set(e.property_id, (tourStartCountByProperty.get(e.property_id) ?? 0) + 1);
    }
    if (e.event_type === "tour_complete") {
      tourCompleteCountByProperty.set(e.property_id, (tourCompleteCountByProperty.get(e.property_id) ?? 0) + 1);
    }
  }

  const favoriteCountByProperty = new Map<string, number>();
  for (const f of favorites ?? []) {
    favoriteCountByProperty.set(f.property_id, (favoriteCountByProperty.get(f.property_id) ?? 0) + 1);
  }

  const allPropertyIds = new Set([
    ...detailViewCountByProperty.keys(),
    ...tourStartCountByProperty.keys(),
    ...favoriteCountByProperty.keys(),
  ]);

  const popularProperties = [...allPropertyIds]
    .map((id) => ({
      propertyId: id,
      propertyName: propertyNameById.get(id) ?? "(削除済み)",
      detailViewCount: detailViewCountByProperty.get(id) ?? 0,
      tourStartCount: tourStartCountByProperty.get(id) ?? 0,
      favoriteCount: favoriteCountByProperty.get(id) ?? 0,
    }))
    .sort((a, b) => b.detailViewCount - a.detailViewCount)
    .slice(0, 20);

  const totalTourStart = [...tourStartCountByProperty.values()].reduce((sum, n) => sum + n, 0);
  const totalTourComplete = [...tourCompleteCountByProperty.values()].reduce((sum, n) => sum + n, 0);
  const totalInquiries = (inquiries ?? []).length;

  const agentInquiryCount = new Map<string, { name: string; count: number }>();
  for (const inq of inquiries ?? []) {
    if (!inq.agent_id) continue;
    const name = (inq.agents as unknown as { name: string } | null)?.name ?? "(不明)";
    const current = agentInquiryCount.get(inq.agent_id) ?? { name, count: 0 };
    current.count += 1;
    agentInquiryCount.set(inq.agent_id, current);
  }

  return NextResponse.json({
    eventCountByType: Object.fromEntries(eventCountByType),
    popularProperties,
    totalTourStart,
    totalTourComplete,
    tourCompletionRate: totalTourStart > 0 ? totalTourComplete / totalTourStart : null,
    totalInquiries,
    inquiryConversionRate: totalTourStart > 0 ? totalInquiries / totalTourStart : null,
    agentPerformance: [...agentInquiryCount.values()].sort((a, b) => b.count - a.count),
  });
}
