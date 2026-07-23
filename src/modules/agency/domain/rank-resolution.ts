// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 3(§8)。src/lib/agents.tsから移設。
// 注意: src/lib/agent-rank.ts(AGENT_RANK_ORDER、代理店候補を含む4段階、城主プランの
// 権限判定用)とは別概念のAgentRank。こちらはsengoku-ai.comから受信した代理店同期
// payloadのrole_level/role_labelを3段階のランクへ解決するためのもの。今回のモジュール化
// では両者の統合は行わず、既存の重複はそのまま残す(意味が異なるものを安易に統一しない)。
const RANKS = ["アドバイザー", "ディレクター", "エージェント"] as const;
export type AgentRank = (typeof RANKS)[number];

export const ROLE_LEVEL_TO_RANK: Record<number, AgentRank> = {
  1: "アドバイザー",
  2: "ディレクター",
  3: "エージェント",
};

export function resolveRank(roleLevel: number | null | undefined, roleLabel: string | null | undefined): AgentRank {
  if (roleLabel && (RANKS as readonly string[]).includes(roleLabel)) return roleLabel as AgentRank;
  if (typeof roleLevel === "number" && ROLE_LEVEL_TO_RANK[roleLevel]) return ROLE_LEVEL_TO_RANK[roleLevel];
  return "アドバイザー";
}
