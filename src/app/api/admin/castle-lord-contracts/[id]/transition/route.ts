import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession } from "@/lib/admin-session";
import {
  canOperatorPerformTransition,
  CONTRACT_STATUSES,
  InvalidContractTransitionError,
  transitionContract,
  type ContractStatus,
} from "@/lib/castle-lord-contracts";
import { notifyContractTransition } from "@/lib/castle-notifications";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === "string" && (CONTRACT_STATUSES as readonly string[]).includes(value);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const toStatus = body?.to_status;
  const reason = typeof body?.reason === "string" ? body.reason : null;

  if (!isContractStatus(toStatus)) {
    return NextResponse.json({ error: "to_status が不正です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: current, error: fetchError } = await supabase
    .from("castle_lord_contracts")
    .select("status, applicant_user_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "契約が見つかりません" }, { status: 404 });

  const fromStatus = current.status as ContractStatus;
  const adminRole = await getAdminRole();
  const isManager = adminRole === "manager";
  if (!isManager && !canOperatorPerformTransition(fromStatus, toStatus)) {
    return NextResponse.json({ error: "この遷移は本部管理者のみ実行できます" }, { status: 403 });
  }

  try {
    const actorName = await getAdminActorName();
    const { contract } = await transitionContract(id, toStatus, actorName, reason);

    await notifyContractTransition(current.applicant_user_id as string, fromStatus, toStatus);

    await logAdminAction(
      actorName,
      "castle_lord_contract_transition",
      `contract_id=${id} ${fromStatus}->${toStatus}`
    );

    return NextResponse.json(contract);
  } catch (error) {
    if (error instanceof InvalidContractTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "遷移に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
