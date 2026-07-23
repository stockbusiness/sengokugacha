import { randomBytes, createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const RANKS = ["アドバイザー", "ディレクター", "エージェント"] as const;
export type AgentRank = (typeof RANKS)[number];

const ROLE_LEVEL_TO_RANK: Record<number, AgentRank> = {
  1: "アドバイザー",
  2: "ディレクター",
  3: "エージェント",
};

function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type AgencyIntegrationSettings = {
  id: string | null;
  inbound_api_key_hash: string | null;
  inbound_api_key_last4: string | null;
  outbound_endpoint_url: string | null;
  outbound_api_key: string | null;
  bidirectional_sync_enabled: boolean;
  sso_enabled: boolean;
  sso_issuer_url: string;
  sso_jwks_url: string;
  sso_audience: string;
};

const DEFAULT_SETTINGS: AgencyIntegrationSettings = {
  id: null,
  inbound_api_key_hash: null,
  inbound_api_key_last4: null,
  outbound_endpoint_url: null,
  outbound_api_key: null,
  bidirectional_sync_enabled: false,
  sso_enabled: false,
  sso_issuer_url: "https://sengoku-ai.com",
  sso_jwks_url: "https://sengoku-ai.com/api/sso/jwks.php",
  sso_audience: "sengoku-passport",
};

export async function getAgencyIntegrationSettings(): Promise<AgencyIntegrationSettings> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agency_integration_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS;
}

export async function verifyInboundApiKey(providedKey: string | null): Promise<boolean> {
  if (!providedKey) return false;
  const settings = await getAgencyIntegrationSettings();
  if (!settings.inbound_api_key_hash) return false;
  return hashApiKey(providedKey) === settings.inbound_api_key_hash;
}

// 発行時のみ平文を返す。以降はハッシュのみDBに保存する(内覧トークンと同じ方式)。
export async function regenerateInboundApiKey(): Promise<{ rawKey: string; settings: AgencyIntegrationSettings }> {
  const rawKey = `spo_${randomBytes(24).toString("base64url")}`;
  const hash = hashApiKey(rawKey);
  const last4 = rawKey.slice(-4);

  const supabase = createSupabaseServerClient();
  const existing = await getAgencyIntegrationSettings();

  let result;
  if (existing.id) {
    result = await supabase
      .from("agency_integration_settings")
      .update({ inbound_api_key_hash: hash, inbound_api_key_last4: last4, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
  } else {
    result = await supabase
      .from("agency_integration_settings")
      .insert({ inbound_api_key_hash: hash, inbound_api_key_last4: last4 })
      .select("*")
      .single();
  }
  if (result.error) throw result.error;

  return { rawKey, settings: { ...DEFAULT_SETTINGS, ...result.data } };
}

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

export function resolveRank(roleLevel: number | null | undefined, roleLabel: string | null | undefined): AgentRank {
  if (roleLabel && (RANKS as readonly string[]).includes(roleLabel)) return roleLabel as AgentRank;
  if (typeof roleLevel === "number" && ROLE_LEVEL_TO_RANK[roleLevel]) return ROLE_LEVEL_TO_RANK[roleLevel];
  return "アドバイザー";
}

// sengoku-ai.comから受信した代理店データをupsertする。external_idを一意キーとする。
// 親(parent_external_id)がまだローカルに存在しない場合はエラーにせず未解決のまま保存し、
// 該当の親データが後で届いた時点で子側のparent_agent_idを解決する。
export async function upsertAgentFromSync(
  payload: AgencySyncPayload
): Promise<{ agent: Record<string, unknown>; action: "created" | "updated" }> {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("agents")
    .select("id, referral_code")
    .eq("external_id", payload.external_id)
    .maybeSingle();
  if (existingError) throw existingError;

  let parentAgentId: string | null = null;
  if (payload.parent_external_id) {
    const { data: parent, error: parentError } = await supabase
      .from("agents")
      .select("id")
      .eq("external_id", payload.parent_external_id)
      .maybeSingle();
    if (parentError) throw parentError;
    parentAgentId = parent?.id ?? null;
  }

  const rank = resolveRank(payload.role_level ?? null, payload.role_label ?? null);
  const status = payload.status === "inactive" ? "inactive" : "active";

  const fields = {
    external_id: payload.external_id,
    parent_external_id: payload.parent_external_id ?? null,
    parent_agent_id: parentAgentId,
    name: payload.name,
    contact_name: payload.contact_name ?? null,
    contact_email: payload.contact_email ?? null,
    login_email: payload.login_email ?? null,
    phone: payload.phone ?? null,
    line_url: payload.line_url ?? null,
    status,
    rank,
    role_level: payload.role_level ?? null,
    lp_urls: payload.lp_urls ?? null,
    source: "sengoku-ai" as const,
    updated_at: new Date().toISOString(),
  };

  let action: "created" | "updated";
  let agent: Record<string, unknown>;

  if (existing) {
    const { data, error } = await supabase.from("agents").update(fields).eq("id", existing.id).select("*").single();
    if (error) throw error;
    agent = data;
    action = "updated";
  } else {
    const { data, error } = await supabase
      .from("agents")
      .insert({ ...fields, referral_code: payload.external_id })
      .select("*")
      .single();
    if (error) throw error;
    agent = data;
    action = "created";
  }

  // 自分を親として待っていた子(未解決のparent_external_id)を解決する。
  const { error: relinkError } = await supabase
    .from("agents")
    .update({ parent_agent_id: agent.id as string })
    .eq("parent_external_id", payload.external_id)
    .is("parent_agent_id", null);
  if (relinkError) throw relinkError;

  return { agent, action };
}

// このアプリで作成・編集された代理店をsengoku-ai.comへ送信する(双方向同期ON時のみ)。
// 失敗しても本体処理(管理画面の保存)は継続する(呼び出し側でtry/catchすること)。
export async function pushAgentToExternal(agentId: string): Promise<void> {
  const settings = await getAgencyIntegrationSettings();
  if (!settings.bidirectional_sync_enabled || !settings.outbound_endpoint_url || !settings.outbound_api_key) return;

  const supabase = createSupabaseServerClient();
  const { data: agent, error } = await supabase.from("agents").select("*").eq("id", agentId).maybeSingle();
  if (error) throw error;
  if (!agent) return;

  let externalId = agent.external_id as string | null;
  if (!externalId) {
    externalId = `local-${agent.id}`;
    const { error: updateError } = await supabase.from("agents").update({ external_id: externalId }).eq("id", agent.id);
    if (updateError) throw updateError;
  }

  const roleLevelEntry = Object.entries(ROLE_LEVEL_TO_RANK).find(([, rank]) => rank === agent.rank);

  const body = {
    source: "sengoku-passport",
    external_id: externalId,
    parent_external_id: agent.parent_external_id ?? null,
    name: agent.name,
    contact_name: agent.contact_name ?? null,
    contact_email: agent.contact_email ?? null,
    login_email: agent.login_email ?? null,
    phone: agent.phone ?? null,
    status: agent.status ?? "active",
    role_level: roleLevelEntry ? Number(roleLevelEntry[0]) : null,
    role_label: agent.rank,
  };

  const endpoint = settings.outbound_endpoint_url.endsWith("/api/integrations/agencies")
    ? settings.outbound_endpoint_url
    : `${settings.outbound_endpoint_url.replace(/\/$/, "")}/api/integrations/agencies`;

  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": settings.outbound_api_key },
    body: JSON.stringify(body),
  });
}

export async function testOutboundConnection(): Promise<{ ok: boolean; status: number; message?: string }> {
  const settings = await getAgencyIntegrationSettings();
  if (!settings.outbound_endpoint_url || !settings.outbound_api_key) {
    return { ok: false, status: 0, message: "送信先URL・APIキーが未設定です" };
  }

  const endpoint = settings.outbound_endpoint_url.endsWith("/api/integrations/agencies")
    ? settings.outbound_endpoint_url
    : `${settings.outbound_endpoint_url.replace(/\/$/, "")}/api/integrations/agencies`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": settings.outbound_api_key },
      body: JSON.stringify({ event: "connection_test", dry_run: true, source: "sengoku-passport", external_id: "__connection_test__" }),
    });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.message : "接続に失敗しました" };
  }
}

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

// 管理画面の「手動で階層を同期」ボタン用。sengoku-ai.comの階層取得APIを呼び、
// 返ってきたツリーを平坦化して親→子の順にupsertする。
export async function syncHierarchyFromAgency(rootExternalId?: string): Promise<{ synced: number }> {
  const settings = await getAgencyIntegrationSettings();
  if (!settings.outbound_api_key) throw new Error("送信用APIキーが未設定です(受信元との認証に使用します)");

  const base = (settings.sso_issuer_url || "https://sengoku-ai.com").replace(/\/$/, "");
  const url = new URL(`${base}/api/hierarchy.php`);
  url.searchParams.set("format", "tree");
  url.searchParams.set("include_contact", "1");
  if (rootExternalId) url.searchParams.set("root_code", rootExternalId);

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": settings.outbound_api_key },
  });
  if (!res.ok) throw new Error(`階層取得APIがエラーを返しました(status=${res.status})`);

  const body = await res.json();
  const roots: HierarchyNode[] = Array.isArray(body) ? body : (body.data ?? body.tree ?? []);
  const flat = flattenHierarchy(roots);

  // 親が先に解決されるよう、parent_external_idが無いものから順に処理する。
  const sorted = [...flat].sort((a, b) => (a.parent_external_id ? 1 : 0) - (b.parent_external_id ? 1 : 0));
  for (const item of sorted) {
    await upsertAgentFromSync(item);
  }

  return { synced: sorted.length };
}
