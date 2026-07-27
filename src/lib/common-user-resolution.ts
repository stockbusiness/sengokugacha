import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveCommonUserId } from "@/lib/common-user-hub";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §5.7。
// LINEログイン時にcommon_user_idが未解決のまま残ったユーザーを後日手動で再解決する。
// 原子的claim(20260811000001)により、一括再解決と個別再解決が同時に走っても
// 同一ユーザーへ二重にresolveCommonUserId()を呼ばない。

function maskLineUserId(lineUserId: string): string {
  if (lineUserId.length <= 6) return "*".repeat(lineUserId.length);
  return `${lineUserId.slice(0, 4)}...${lineUserId.slice(-2)}`;
}

export type UnresolvedCommonUser = {
  userId: string;
  lineUserIdMasked: string;
  displayName: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  attemptCount: number;
  lastError: string | null;
  referringAgentId: string | null;
  assignedAgentId: string | null;
};

type UnresolvedUserRow = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  created_at: string;
  referring_agent_id: string | null;
  assigned_agent_id: string | null;
  common_user_resolution_attempts: { attempt_count: number; last_attempt_at: string | null; last_error: string | null }[] | null;
};

// usersテーブルにemail列が無いため(LINEログインのみで発行されるアカウントのため)、
// 指示書§5.7の表示項目からemailは除外し、代わりにline_user_idのマスク値・
// referring_agent_id・assigned_agent_idで運用上の識別を行う。
export async function listUnresolvedCommonUsers(): Promise<UnresolvedCommonUser[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, line_user_id, display_name, created_at, referring_agent_id, assigned_agent_id, common_user_resolution_attempts(attempt_count, last_attempt_at, last_error)"
    )
    .is("common_user_id", null)
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<UnresolvedUserRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const attempt = row.common_user_resolution_attempts?.[0] ?? null;
    return {
      userId: row.id,
      lineUserIdMasked: maskLineUserId(row.line_user_id),
      displayName: row.display_name,
      createdAt: row.created_at,
      lastAttemptAt: attempt?.last_attempt_at ?? null,
      attemptCount: attempt?.attempt_count ?? 0,
      lastError: attempt?.last_error ?? null,
      referringAgentId: row.referring_agent_id,
      assignedAgentId: row.assigned_agent_id,
    };
  });
}

export type RetryResolveOutcome = "resolved" | "still_unresolved" | "in_progress" | "already_resolved" | "not_found";

export async function retryResolveCommonUser(userId: string): Promise<RetryResolveOutcome> {
  const supabase = createSupabaseServerClient();
  const claimToken = randomUUID();

  const { data: claimOutcome, error: claimError } = await supabase.rpc("claim_common_user_resolution", {
    p_user_id: userId,
    p_claim_token: claimToken,
  });
  if (claimError) throw new Error(claimError.message);
  if (claimOutcome === "not_found" || claimOutcome === "already_resolved" || claimOutcome === "in_progress") {
    return claimOutcome;
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("line_user_id, display_name")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    await supabase.rpc("mark_common_user_resolution_failed", {
      p_user_id: userId,
      p_claim_token: claimToken,
      p_error: userError?.message ?? "user not found",
    });
    return "still_unresolved";
  }

  let commonUserId: string | null = null;
  try {
    commonUserId = await resolveCommonUserId({
      externalUserId: user.line_user_id,
      displayName: user.display_name,
    });
  } catch (error) {
    await supabase.rpc("mark_common_user_resolution_failed", {
      p_user_id: userId,
      p_claim_token: claimToken,
      p_error: error instanceof Error ? error.message : String(error),
    });
    return "still_unresolved";
  }

  if (!commonUserId) {
    await supabase.rpc("mark_common_user_resolution_failed", {
      p_user_id: userId,
      p_claim_token: claimToken,
      p_error: "resolveCommonUserId returned null",
    });
    return "still_unresolved";
  }

  const { data: succeeded, error: markError } = await supabase.rpc("mark_common_user_resolution_succeeded", {
    p_user_id: userId,
    p_claim_token: claimToken,
    p_common_user_id: commonUserId,
  });
  if (markError) throw new Error(markError.message);
  return succeeded ? "resolved" : "still_unresolved";
}

export async function retryResolveAllUnresolvedCommonUsers(): Promise<{ retriedCount: number; resolvedCount: number }> {
  const unresolved = await listUnresolvedCommonUsers();
  let retriedCount = 0;
  let resolvedCount = 0;
  for (const user of unresolved) {
    retriedCount++;
    try {
      const outcome = await retryResolveCommonUser(user.userId);
      if (outcome === "resolved") resolvedCount++;
    } catch {
      continue; // 未解決のまま残す。次回の再実行に委ねる。
    }
  }
  return { retriedCount, resolvedCount };
}
