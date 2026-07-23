import { createSupabaseServerClient } from "@/lib/supabase-server";
import { grantInitialPlotAllocation } from "@/lib/castle-plots";
import {
  CONTRACT_STATUSES,
  isValidContractTransition,
  canOperatorPerformTransition,
  InvalidContractTransitionError,
  type ContractStatus,
} from "@/modules/castle/domain/contract-state";

export {
  CONTRACT_STATUSES,
  isValidContractTransition,
  canOperatorPerformTransition,
  InvalidContractTransitionError,
  type ContractStatus,
};

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
