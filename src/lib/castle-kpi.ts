import { createSupabaseServerClient } from "@/lib/supabase-server";

// 要件書13章「城主ダッシュボード」(Phase1スコープの項目のみ)。
export type LordDashboardSummary = {
  contract: { id: string; status: string; castleName: string | null } | null;
  plotCapacity: number;
  plotsSold: number;
  plotsAvailable: number;
  totalLandSalesYen: number;
  commissionHeldYen: number;
  commissionConfirmedYen: number;
  commissionPaidYen: number;
};

export async function getLordDashboardSummary(userId: string): Promise<LordDashboardSummary> {
  const supabase = createSupabaseServerClient();

  const { data: contract } = await supabase
    .from("castle_lord_contracts")
    .select("id, status, castle_id, castles:castle_id(name)")
    .eq("applicant_user_id", userId)
    .neq("status", "terminated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!contract) {
    return {
      contract: null,
      plotCapacity: 0,
      plotsSold: 0,
      plotsAvailable: 0,
      totalLandSalesYen: 0,
      commissionHeldYen: 0,
      commissionConfirmedYen: 0,
      commissionPaidYen: 0,
    };
  }

  const [{ data: allocations }, { data: plots }, { data: commissionLines }] = await Promise.all([
    supabase.from("plot_allocations").select("granted_capacity").eq("contract_id", contract.id).eq("status", "active"),
    contract.castle_id
      ? supabase.from("castle_plots").select("status, sold_price_yen").eq("castle_id", contract.castle_id)
      : Promise.resolve({ data: [] as { status: string; sold_price_yen: number | null }[] }),
    supabase
      .from("commission_ledger")
      .select("amount_yen, status")
      .eq("recipient_type", "lord")
      .eq("recipient_user_id", userId)
      .is("reversal_of_ledger_id", null),
  ]);

  const plotCapacity = (allocations ?? []).reduce((sum, a) => sum + (a.granted_capacity as number), 0);
  const soldPlots = (plots ?? []).filter((p) => p.status === "sold");
  const totalLandSalesYen = soldPlots.reduce((sum, p) => sum + (p.sold_price_yen ?? 0), 0);

  const commissionByStatus = { held: 0, confirmed: 0, paid: 0 } as Record<string, number>;
  for (const line of commissionLines ?? []) {
    const status = line.status as string;
    if (status in commissionByStatus) commissionByStatus[status] += line.amount_yen as number;
  }

  return {
    contract: {
      id: contract.id as string,
      status: contract.status as string,
      castleName: (contract.castles as unknown as { name: string } | null)?.name ?? null,
    },
    plotCapacity,
    plotsSold: soldPlots.length,
    plotsAvailable: (plots ?? []).filter((p) => p.status === "available").length,
    totalLandSalesYen,
    commissionHeldYen: commissionByStatus.held,
    commissionConfirmedYen: commissionByStatus.confirmed,
    commissionPaidYen: commissionByStatus.paid,
  };
}

// 代理店ポータル拡張用(要件書12章)。
export type AgencyLandCommissionSummary = {
  heldYen: number;
  confirmedYen: number;
  paidYen: number;
  soldPlotCount: number;
};

export async function getAgencyLandCommissionSummary(agentId: string): Promise<AgencyLandCommissionSummary> {
  const supabase = createSupabaseServerClient();
  const { data: lines } = await supabase
    .from("commission_ledger")
    .select("amount_yen, status, purchase_id")
    .eq("recipient_type", "agency")
    .eq("recipient_agent_id", agentId)
    .is("reversal_of_ledger_id", null);

  const byStatus = { held: 0, confirmed: 0, paid: 0 } as Record<string, number>;
  const purchaseIds = new Set<string>();
  for (const line of lines ?? []) {
    const status = line.status as string;
    if (status in byStatus) byStatus[status] += line.amount_yen as number;
    purchaseIds.add(line.purchase_id as string);
  }

  return {
    heldYen: byStatus.held,
    confirmedYen: byStatus.confirmed,
    paidYen: byStatus.paid,
    soldPlotCount: purchaseIds.size,
  };
}

// 本部ダッシュボード拡張用(要件書14章)。
export type HqCastleLordSummary = {
  castleCount: number;
  activeContractCount: number;
  pendingContractCount: number; // screening/approved/payment_pending/training
  totalLandSalesYen: number;
  commissionByRecipient: Record<string, number>;
};

export async function getHqCastleLordSummary(): Promise<HqCastleLordSummary> {
  const supabase = createSupabaseServerClient();

  const [{ count: castleCount }, { data: contracts }, { data: soldPlots }, { data: commissionLines }] =
    await Promise.all([
      supabase.from("castles").select("id", { count: "exact", head: true }),
      supabase.from("castle_lord_contracts").select("status"),
      supabase.from("castle_plots").select("sold_price_yen").eq("status", "sold"),
      supabase
        .from("commission_ledger")
        .select("recipient_type, amount_yen")
        .in("status", ["held", "confirmed", "payable", "paid"])
        .is("reversal_of_ledger_id", null),
    ]);

  const pendingStatuses = new Set(["screening", "approved", "payment_pending", "training"]);
  let activeContractCount = 0;
  let pendingContractCount = 0;
  for (const c of contracts ?? []) {
    if (c.status === "active") activeContractCount++;
    else if (pendingStatuses.has(c.status as string)) pendingContractCount++;
  }

  const totalLandSalesYen = (soldPlots ?? []).reduce((sum, p) => sum + (p.sold_price_yen ?? 0), 0);

  const commissionByRecipient: Record<string, number> = {};
  for (const line of commissionLines ?? []) {
    const key = line.recipient_type as string;
    commissionByRecipient[key] = (commissionByRecipient[key] ?? 0) + (line.amount_yen as number);
  }

  return {
    castleCount: castleCount ?? 0,
    activeContractCount,
    pendingContractCount,
    totalLandSalesYen,
    commissionByRecipient,
  };
}
