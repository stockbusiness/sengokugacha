// 代理店ランクの序列。02_additional_considerations_v1.1.md:12「ランク: アドバイザー → ディレクター →
// エージェント」に、8.7 TC4(アドバイザー未満)を表現するための「代理店候補」を最下位として追加した。
export const AGENT_RANK_ORDER = ["代理店候補", "アドバイザー", "ディレクター", "エージェント"] as const;
export type AgentRank = (typeof AGENT_RANK_ORDER)[number];

export function meetsMinimumRank(rank: string, minRank: string): boolean {
  const rankIndex = (AGENT_RANK_ORDER as readonly string[]).indexOf(rank);
  const minIndex = (AGENT_RANK_ORDER as readonly string[]).indexOf(minRank);
  if (rankIndex === -1 || minIndex === -1) return false;
  return rankIndex >= minIndex;
}
