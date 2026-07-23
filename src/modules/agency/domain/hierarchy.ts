// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 3(§8)。src/lib/agents.tsから移設。

export type AgencySyncPayload = {
  external_id: string;
  parent_external_id?: string | null;
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  login_email?: string | null;
  phone?: string | null;
  line_url?: string | null;
  status?: string | null;
  role_level?: number | null;
  role_label?: string | null;
  lp_urls?: unknown;
};

export type HierarchyNode = {
  external_id?: string;
  agent_code?: string;
  parent_external_id?: string;
  parent_code?: string;
  name?: string;
  contact_email?: string;
  login_email?: string;
  phone?: string;
  role_level?: number;
  role_label?: string;
  status?: string;
  children?: HierarchyNode[];
};

export function flattenHierarchy(nodes: HierarchyNode[], parentExternalId: string | null = null): AgencySyncPayload[] {
  const result: AgencySyncPayload[] = [];
  for (const node of nodes) {
    const externalId = node.external_id ?? node.agent_code;
    if (!externalId) continue;
    result.push({
      external_id: externalId,
      parent_external_id: node.parent_external_id ?? node.parent_code ?? parentExternalId,
      name: node.name ?? externalId,
      contact_email: node.contact_email ?? null,
      login_email: node.login_email ?? null,
      phone: node.phone ?? null,
      status: node.status ?? "active",
      role_level: node.role_level ?? null,
      role_label: node.role_label ?? null,
    });
    if (node.children?.length) {
      result.push(...flattenHierarchy(node.children, externalId));
    }
  }
  return result;
}
