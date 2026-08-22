import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getWalletAdapterKind } from "@/lib/wallet-adapter-settings";
import { FakeWalletAdapter } from "@/modules/learning-journey/infrastructure/fake-wallet-adapter";
import {
  computeRetryDelaySeconds,
  isRetryable,
  type WalletAdapter,
  type WalletGrantRequest,
} from "@/modules/learning-journey/domain/wallet-contract";

// 「はじまりの旅」PR5-a。付与要求の送信処理。
//
// PR5-aでは Fake アダプタにしか繋がない。HTTPアダプタは PR5-b。
// ここが行うのは claim → 送信 → 結果反映 の流れと、その排他制御だけ。

// PR5-aで選べる実装は Fake のみ。'http' が来ても Fake を返す
// (getWalletAdapterKind() 側のゲートで既に 'fake' へ倒れているが、二重に守る)。
export function createWalletAdapter(kind: "fake" | "http"): WalletAdapter {
  if (kind === "http") {
    throw new Error("HTTPアダプタは未実装です(PR5-b)。wallet_adapterをfakeに戻してください");
  }
  return new FakeWalletAdapter();
}

export type DispatchOutcome =
  | "succeeded"
  | "failed_transient"
  | "failed_permanent"
  | "skipped"
  | "claim_lost";

export type DispatchDeps = {
  // テストから Fake を差し替えられるようにしておく。
  adapter?: WalletAdapter;
  now?: () => Date;
};

// 1件の付与要求を送信する。
//
// claim に失敗した場合(他のworkerが処理中、バックオフ中、上限到達等)は 'skipped' を
// 返して何もしない。呼び出し側はこれを異常として扱わない。
export async function dispatchRewardRequest(
  rewardRequestId: string,
  deps: DispatchDeps = {}
): Promise<DispatchOutcome> {
  const supabase = createSupabaseServerClient();
  const claimToken = randomUUID();

  const { data: claimOutcome, error: claimError } = await supabase.rpc(
    "claim_learning_journey_reward_request",
    { p_id: rewardRequestId, p_claim_token: claimToken }
  );
  if (claimError) throw claimError;
  if (claimOutcome !== "claimed") return "skipped";

  const { data: request, error: requestError } = await supabase
    .from("learning_journey_reward_requests")
    .select("id, external_user_id, amount, idempotency_key, attempt_count")
    .eq("id", rewardRequestId)
    .single();
  if (requestError) throw requestError;

  const adapter = deps.adapter ?? createWalletAdapter(await getWalletAdapterKind());

  const grantRequest: WalletGrantRequest = {
    idempotencyKey: request.idempotency_key,
    user: {
      kind: "external_user_id",
      // service_code と取引種別・rule_code の正式値はWallet側の回答待ち(PR5-b)。
      // Fake は値を検証しないため、PR5-aでは仮の値で通す。
      serviceCode: "passport",
      externalUserId: request.external_user_id,
    },
    amount: request.amount,
    transactionType: "LEARNING_JOURNEY_REWARD",
    ruleCode: "SENGOKU_LEARNING_JOURNEY_REWARD",
  };

  let result;
  try {
    result = await adapter.grant(grantRequest);
  } catch (error) {
    // タイムアウト等。一時障害として扱い、バックオフ後に再試行する。
    const message = error instanceof Error ? error.message : "unknown error";
    await markFailed(supabase, rewardRequestId, claimToken, "timeout", message, request.attempt_count);
    return "failed_transient";
  }

  if (result.ok) {
    const { data: marked, error } = await supabase.rpc("mark_learning_journey_reward_succeeded", {
      p_id: rewardRequestId,
      p_claim_token: claimToken,
      p_transaction_id: result.transactionId,
    });
    if (error) throw error;
    // fencing により false = 自分のclaimは失効していた。取引IDを保存しない。
    return marked ? "succeeded" : "claim_lost";
  }

  const retryable = isRetryable(result.failure.kind);
  await markFailed(
    supabase,
    rewardRequestId,
    claimToken,
    result.failure.code,
    result.failure.message,
    request.attempt_count,
    retryable
  );
  return retryable ? "failed_transient" : "failed_permanent";
}

async function markFailed(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  rewardRequestId: string,
  claimToken: string,
  errorCode: string,
  message: string,
  attemptCount: number,
  retryable = true
): Promise<void> {
  const { error } = await supabase.rpc("mark_learning_journey_reward_failed", {
    p_id: rewardRequestId,
    p_claim_token: claimToken,
    p_error_code: errorCode,
    p_error: message,
    // null なら恒久エラー。next_retry_at を立てない。
    p_retry_after_seconds: retryable ? computeRetryDelaySeconds(attemptCount) : null,
  });
  if (error) throw error;
}
