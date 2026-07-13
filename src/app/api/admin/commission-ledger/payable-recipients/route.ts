import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type Group = {
  recipientType: string;
  recipientUserId: string | null;
  recipientAgentId: string | null;
  totalAmountYen: number;
  displayName: string;
};

// 確定済み(confirmed)かつ未支払(payout_id無し)の報酬明細を、受取者単位でまとめて返す。
// 14.5「報酬確定・支払」の支払対象一覧。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data: lines, error } = await supabase
    .from("commission_ledger")
    .select("recipient_type, recipient_user_id, recipient_agent_id, amount_yen")
    .eq("status", "confirmed")
    .is("payout_id", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = new Map<string, Group>();
  for (const line of lines ?? []) {
    const key = `${line.recipient_type}:${line.recipient_user_id ?? ""}:${line.recipient_agent_id ?? ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.totalAmountYen += line.amount_yen as number;
    } else {
      groups.set(key, {
        recipientType: line.recipient_type as string,
        recipientUserId: (line.recipient_user_id as string | null) ?? null,
        recipientAgentId: (line.recipient_agent_id as string | null) ?? null,
        totalAmountYen: line.amount_yen as number,
        displayName: "",
      });
    }
  }

  const groupList = Array.from(groups.values());

  const userIds = groupList.map((g) => g.recipientUserId).filter((id): id is string => !!id);
  const agentIds = groupList.map((g) => g.recipientAgentId).filter((id): id is string => !!id);

  const [{ data: users }, { data: agents }] = await Promise.all([
    userIds.length ? supabase.from("users").select("id, display_name").in("id", userIds) : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    agentIds.length ? supabase.from("agents").select("id, name").in("id", agentIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.display_name ?? "(表示名未設定)"]));
  const agentNameById = new Map((agents ?? []).map((a) => [a.id, a.name]));

  for (const g of groupList) {
    if (g.recipientUserId) g.displayName = userNameById.get(g.recipientUserId) ?? "(不明なユーザー)";
    else if (g.recipientAgentId) g.displayName = agentNameById.get(g.recipientAgentId) ?? "(不明な代理店)";
  }

  return NextResponse.json(groupList);
}
