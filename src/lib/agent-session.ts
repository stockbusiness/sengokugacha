import { cookies } from "next/headers";
import { signSessionJwt, verifySessionJwt } from "@/shared/auth";

export const AGENT_SESSION_COOKIE_NAME = "sengoku_agent_session";
const AGENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12時間(SSOで再ログインしてもらう想定)

export async function setAgentSessionCookie(agentId: string, externalId: string, name: string) {
  const token = await signSessionJwt({ role: "agent", agentId, externalId, name }, AGENT_SESSION_MAX_AGE_SECONDS);

  const cookieStore = await cookies();
  cookieStore.set(AGENT_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AGENT_SESSION_MAX_AGE_SECONDS,
  });
}

export type AgentSession = { agentId: string; externalId: string; name: string };

export async function getAgentSession(): Promise<AgentSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AGENT_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionJwt(token);
  if (!payload || payload.role !== "agent" || typeof payload.agentId !== "string") return null;
  return {
    agentId: payload.agentId,
    externalId: typeof payload.externalId === "string" ? payload.externalId : "",
    name: typeof payload.name === "string" ? payload.name : "",
  };
}

export async function clearAgentSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AGENT_SESSION_COOKIE_NAME);
}
