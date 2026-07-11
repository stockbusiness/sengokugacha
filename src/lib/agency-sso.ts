import { createRemoteJWKSet, jwtVerify } from "jose";
import { getAgencyIntegrationSettings } from "@/lib/agents";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type AgencySsoErrorCode = "agency_not_linked" | "agency_inactive" | "sso_expired" | "sso_replayed" | "sso_disabled";

export class AgencySsoError extends Error {
  code: AgencySsoErrorCode;
  constructor(code: AgencySsoErrorCode) {
    super(code);
    this.code = code;
  }
}

export type AgencySsoAgent = {
  id: string;
  external_id: string;
  name: string;
  rank: string;
  referral_code: string;
};

// JWKSクライアントはkid単位でキャッシュされる(jose標準機能)。プロセス内で使い回す。
let jwksCache: { url: string; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null;

function getJwks(jwksUrl: string) {
  if (jwksCache?.url === jwksUrl) return jwksCache.jwks;
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  jwksCache = { url: jwksUrl, jwks };
  return jwks;
}

// 代理店システムSSO連携仕様書 6〜10章に準拠したJWT検証。
export async function verifyAgencySsoToken(rawToken: string): Promise<AgencySsoAgent> {
  const settings = await getAgencyIntegrationSettings();
  if (!settings.sso_enabled) throw new AgencySsoError("sso_disabled");

  const jwks = getJwks(settings.sso_jwks_url);

  let payload;
  try {
    const result = await jwtVerify(rawToken, jwks, {
      issuer: settings.sso_issuer_url,
      audience: settings.sso_audience,
      algorithms: ["RS256"],
      clockTolerance: 60,
    });
    payload = result.payload;
  } catch {
    throw new AgencySsoError("sso_expired");
  }

  const jti = typeof payload.jti === "string" ? payload.jti : null;
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const aud = typeof payload.aud === "string" ? payload.aud : settings.sso_audience;
  if (!jti || !sub) throw new AgencySsoError("sso_expired");

  const supabase = createSupabaseServerClient();

  // jtiのワンタイム利用チェック(仕様書8章)。unique制約違反(23505)は再利用とみなす。
  const expiresAt = typeof payload.exp === "number" ? new Date(payload.exp * 1000).toISOString() : new Date().toISOString();
  const { error: jtiError } = await supabase
    .from("agency_sso_used_jti")
    .insert({ jti, sub, aud, expires_at: expiresAt });
  if (jtiError) {
    if (jtiError.code === "23505") throw new AgencySsoError("sso_replayed");
    throw jtiError;
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, external_id, name, rank, referral_code, status")
    .eq("external_id", sub)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) throw new AgencySsoError("agency_not_linked");
  if (agent.status === "inactive") throw new AgencySsoError("agency_inactive");

  return {
    id: agent.id,
    external_id: agent.external_id,
    name: agent.name,
    rank: agent.rank,
    referral_code: agent.referral_code,
  };
}
