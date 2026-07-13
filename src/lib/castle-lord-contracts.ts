import { createSupabaseServerClient } from "@/lib/supabase-server";
import { grantInitialPlotAllocation } from "@/lib/castle-plots";

// 要件書6.4の契約状態遷移マトリクスをそのままコードで表現する。
export const CONTRACT_STATUSES = [
  "draft",
  "screening",
  "approved",
  "payment_pending",
  "training",
  "active",
  "suspended",
  "expired",
  "terminated",
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ["screening", "terminated"],
  screening: ["approved", "terminated"], // terminatedは却下を意味する
  approved: ["payment_pending", "terminated"],
  payment_pending: ["approved", "training", "terminated"], // approvedへの逆行は入金失敗時
  training: ["active", "terminated"], // terminatedは研修放棄
  active: ["suspended", "expired", "terminated"],
  suspended: ["active", "expired", "terminated"], // activeへの復帰は本部承認が前提
  expired: ["active", "terminated"], // activeへの復帰は更新承認が前提
  terminated: [], // 終端状態。以降の遷移は一切許可しない
};

// 本部担当者(operator)が実行できる遷移。それ以外は本部管理者(manager)限定
// (要件書5.2「城主は本部承認なしに...」「報酬の手動変更は本部管理者のみ」の考え方を踏襲し、
// 入金確定以降=payment_pendingからの遷移は財務・契約継続性への影響が大きいためmanager限定とする)。
const OPERATOR_ALLOWED_TRANSITIONS: Set<string> = new Set([
  "draft:screening",
  "draft:terminated",
  "screening:approved",
  "screening:terminated",
  "approved:payment_pending",
]);

export function isValidContractTransition(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canOperatorPerformTransition(from: ContractStatus, to: ContractStatus): boolean {
  return OPERATOR_ALLOWED_TRANSITIONS.has(`${from}:${to}`);
}

export class InvalidContractTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`${from}から${to}への遷移は許可されていません`);
    this.name = "InvalidContractTransitionError";
  }
}

type TransitionResult = {
  contract: Record<string, unknown>;
};

// 契約の状態を遷移させ、履歴(castle_lord_contract_events)を記録する。
// snapshot_beforeに更新前の全カラムを保存することで、6.4実装メモの「expired→activeは
// 同一行を更新し旧値を退避する」といった更新系イベントも同じ仕組みで扱える。
export async function transitionContract(
  contractId: string,
  toStatus: ContractStatus,
  actorName: string | null,
  reason?: string | null
): Promise<TransitionResult> {
  const supabase = createSupabaseServerClient();

  const { data: current, error: fetchError } = await supabase
    .from("castle_lord_contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!current) throw new Error("契約が見つかりません");

  const fromStatus = current.status as ContractStatus;
  if (!isValidContractTransition(fromStatus, toStatus)) {
    throw new InvalidContractTransitionError(fromStatus, toStatus);
  }

  const fields: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() };
  if (toStatus === "active") fields.activated_at = new Date().toISOString();
  if (toStatus === "terminated") fields.terminated_at = new Date().toISOString();
  // 承認時点で担当城を確定する(6.1フロー「契約条件・担当城・契約期間確定」)。
  if (toStatus === "approved" && !current.castle_id && current.desired_castle_id) {
    fields.castle_id = current.desired_castle_id;
  }

  const { data: updated, error: updateError } = await supabase
    .from("castle_lord_contracts")
    .update(fields)
    .eq("id", contractId)
    .select("*")
    .single();
  if (updateError) throw updateError;

  const { error: eventError } = await supabase.from("castle_lord_contract_events").insert({
    contract_id: contractId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: actorName,
    reason: reason || null,
    snapshot_before: current,
  });
  if (eventError) throw eventError;

  // 要件書4.3「初期30区画の販売枠割り当て」。研修完了による初回の有効化(training→active)
  // でのみ発生させ、停止・失効からの復帰(suspended/expired→active)では再付与しない
  // (段階2/3への拡張ロジックと同様、Phase1では自動判定は行わない前提のため)。
  if (fromStatus === "training" && toStatus === "active" && current.castle_id) {
    await grantInitialPlotAllocation(
      contractId,
      current.castle_id as string,
      (current.initial_plot_capacity as number) ?? 30,
      actorName
    );
  }

  return { contract: updated };
}
