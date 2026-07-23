import { createHash } from "node:crypto";

// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 3(§8)。src/lib/agents.tsから移設。
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
