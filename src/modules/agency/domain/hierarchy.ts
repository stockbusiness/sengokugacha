// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 3(§8)。src/lib/agents.tsから移設。
//
// GET /api/hierarchy.php のレスポンスをローカルのagentsへ流し込む形に平坦化する。
// 2026-08-03のsengoku-ai.com開発者回答で、現行実装が実際に返すのは
// `code` / `level` / `contact.email` などであり、`agent_code` / `role_level` /
// `contact_email` は標準レスポンス項目ではないことが確認された。
// 旧名でも受け取れるようにしておくことは先方から明示的に了承を得ているため、
// 新旧どちらの名前でも取り込めるようにしている(先方の資料改訂待ちの期間や、
// 将来の項目名変更でも同期が止まらないようにするため)。

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

// include_contact=1 のとき連絡先はこの入れ子で返る。
export type HierarchyContact = {
  email?: string | null;
  phone?: string | null;
  line_url?: string | null;
};

export type HierarchyLpUrl = {
  project_id?: number;
  project_key?: string;
  project_slug?: string;
  project_name?: string;
  url?: string;
};

export type HierarchyNode = {
  // 現行レスポンスの識別子。`agency_id` と `code` は同じ値が入る。
  code?: string;
  agency_id?: string;
  // 旧名・別名(資料の版によって現れる)。
  external_id?: string;
  agent_code?: string;

  parent_code?: string | null;
  parent_agency_id?: string | null;
  parent_external_id?: string | null;

  name?: string;
  person_name?: string;
  // 現行レスポンスは `level`。`role_level` は旧名。
  level?: number;
  role_level?: number;
  role_label?: string;
  status?: string;

  contact?: HierarchyContact | null;
  // 最上位に平たく来る形(旧名)。
  contact_email?: string;
  login_email?: string;
  phone?: string;
  line_url?: string;

  lp_urls?: HierarchyLpUrl[];
  children?: HierarchyNode[];
};

// 空文字は「未設定」として扱う(先方が空文字を返す項目があっても親IDに空文字が
// 入らないようにするため)。
function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function flattenHierarchy(nodes: HierarchyNode[], parentExternalId: string | null = null): AgencySyncPayload[] {
  const result: AgencySyncPayload[] = [];
  for (const node of nodes) {
    const externalId = firstNonEmpty(node.code, node.agency_id, node.external_id, node.agent_code);
    if (!externalId) continue;

    // 親は、明示された親コードを優先し、無ければツリー上の親から引き継ぐ。
    // ルート要素では parent_* が明示的にnullで来るため、その場合は
    // 引数の parentExternalId(=null)に落ちる。
    const parent = firstNonEmpty(node.parent_code, node.parent_agency_id, node.parent_external_id, parentExternalId);

    result.push({
      external_id: externalId,
      parent_external_id: parent,
      name: firstNonEmpty(node.name, externalId) ?? externalId,
      // person_nameは「担当者名」。ローカルのcontact_nameに対応する。
      contact_name: firstNonEmpty(node.person_name),
      contact_email: firstNonEmpty(node.contact?.email, node.contact_email),
      login_email: firstNonEmpty(node.login_email),
      phone: firstNonEmpty(node.contact?.phone, node.phone),
      line_url: firstNonEmpty(node.contact?.line_url, node.line_url),
      status: firstNonEmpty(node.status) ?? "active",
      role_level: node.level ?? node.role_level ?? null,
      role_label: firstNonEmpty(node.role_label),
      lp_urls: node.lp_urls ?? null,
    });

    if (node.children?.length) {
      result.push(...flattenHierarchy(node.children, externalId));
    }
  }
  return result;
}

// lp_urlsから案件識別子(project_key)を取り出す。先方回答(2026-08-03)により
// project_keyの値は projects[].slug と同じで、project_slug は互換名。
export function extractProjectKeys(lpUrls: HierarchyLpUrl[] | null | undefined): string[] {
  if (!lpUrls) return [];
  const keys = lpUrls
    .map((lp) => firstNonEmpty(lp.project_key, lp.project_slug))
    .filter((key): key is string => key !== null);
  return Array.from(new Set(keys));
}
