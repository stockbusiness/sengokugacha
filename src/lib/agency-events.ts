import { SupabaseAgencyEventRepository } from "@/modules/integrations/infrastructure/supabase-agency-event-repository";
import { handleCommonUserMerged as handleCommonUserMergedApp } from "@/modules/integrations/application/handle-common-user-merged";
import {
  handleAssignedAgentUpdated as handleAssignedAgentUpdatedApp,
  isExplicitUnassignment,
} from "@/modules/integrations/application/handle-assigned-agent-updated";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(integrationsモジュール)。
// 実装本体はsrc/modules/integrations/application/handle-common-user-merged.ts・
// handle-assigned-agent-updated.ts(application層)、supabase-agency-event-repository.ts
// (infrastructure層)へ移設した。既存のimport経路(@/lib/agency-events)を変更せずに
// 使い続けられるよう、本ファイルは薄い互換ラッパーとして残す。

export { isExplicitUnassignment };

export async function handleCommonUserMerged(body: Record<string, unknown>): Promise<void> {
  await handleCommonUserMergedApp(new SupabaseAgencyEventRepository(), body);
}

export async function handleAssignedAgentUpdated(body: Record<string, unknown>): Promise<void> {
  await handleAssignedAgentUpdatedApp(new SupabaseAgencyEventRepository(), body);
}
