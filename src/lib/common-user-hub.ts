import { randomUUID } from "node:crypto";
import { getAgencyIntegrationSettings } from "@/lib/agents";

// sengoku-ai.com 外部開発者向け連携ガイド 9〜10章(共通顧客ID・紹介/成果連携)対応。
// 戦国パスポート側のsystem_key。サービス名称が変わっても固定する
// (sengoku-ai.com側からの回答で「system_keyは将来にわたって固定する前提」と確認済み)。
export const COMMON_HUB_SYSTEM_KEY = "sengoku-passport";

type OutboundConfig = { baseUrl: string; apiKey: string };

async function getOutboundConfig(): Promise<OutboundConfig | null> {
  const settings = await getAgencyIntegrationSettings();
  if (!settings.outbound_api_key) return null;
  const baseUrl = (settings.sso_issuer_url || "https://sengoku-ai.com").replace(/\/$/, "");
  return { baseUrl, apiKey: settings.outbound_api_key };
}

// 共通顧客HUB系APIはsengoku-ai.com側でも機能フラグ(common_hub_enabled等)次第の状態と
// 確認済みのため、失敗(ネットワークエラー・403 FEATURE_DISABLED・503
// COMMON_HUB_SCHEMA_NOT_READY等)は全てfail-openで扱い、呼び出し元の主処理
// (ログイン・登録・購入)を絶対に止めない。
async function postToAgencySystem(
  config: OutboundConfig,
  path: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(body),
      // ログイン・登録・購入の主処理を待たせすぎないよう上限を設ける。
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // エラー形式(新形式{ok,error:{code,message}} / 旧形式{success,message}等)を
      // 実際の応答から判別できるよう、本文も記録する(過度に長いログを避けるため500文字まで)。
      const bodyText = await res.text().catch(() => "");
      console.warn(`[common-user-hub] ${path} が失敗しました(status=${res.status}) body=${bodyText.slice(0, 500)}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.warn(`[common-user-hub] ${path} の呼び出しに失敗しました`, error);
    return null;
  }
}

export type ResolveCommonUserInput = {
  externalUserId: string;
  email?: string | null;
  displayName?: string | null;
};

// ガイド9.1章 POST /api/common-users/resolve。
export async function resolveCommonUserId(input: ResolveCommonUserInput): Promise<string | null> {
  const config = await getOutboundConfig();
  if (!config) return null;

  const result = await postToAgencySystem(config, "/api/common-users/resolve", {
    system_key: COMMON_HUB_SYSTEM_KEY,
    external_user_id: input.externalUserId,
    email: input.email ?? undefined,
    display_name: input.displayName ?? undefined,
    create_if_missing: true,
  });

  const commonUserId = result?.common_user_id;
  return typeof commonUserId === "string" && commonUserId.length > 0 ? commonUserId : null;
}

// ガイド10.1章 POST /api/referrals/capture。session_keyは戦国パスポート側では発行せず
// sengoku-ai.com側の発行値を使う(問い合わせ回答で確認済みの推奨方式)。
export async function captureReferral(referralToken: string): Promise<string | null> {
  const config = await getOutboundConfig();
  if (!config) return null;

  const result = await postToAgencySystem(config, "/api/referrals/capture", {
    referral_token: referralToken,
    system_key: COMMON_HUB_SYSTEM_KEY,
    event_type: "capture",
  });

  const sessionKey = result?.session_key;
  return typeof sessionKey === "string" && sessionKey.length > 0 ? sessionKey : null;
}

export type ConfirmReferralInput = {
  referralSessionKey: string;
  externalUserId: string;
  email?: string | null;
  referralSource: "registration" | "purchase";
  metadata?: Record<string, unknown>;
};

// ガイド10.2章 POST /api/referrals/confirm。登録確定・購入確定などの成果発生時に呼ぶ。
// postToAgencySystem()は既存方針通りfail-open(例外を投げず、失敗時はnullを返す)。
// 戻り値のboolean(送信成功したか)は、モジュール化後バグ修正・Phase B改修指示書§4.3.3で
// 購入イベントの送信結果をoutboxへ記録する呼び出し元(src/lib/purchase-grants.ts)のために
// 追加した。戻り値を使わない既存呼び出し元(src/lib/passport.ts)の挙動は変更しない。
export async function confirmReferral(input: ConfirmReferralInput): Promise<boolean> {
  const config = await getOutboundConfig();
  if (!config) return false;

  const result = await postToAgencySystem(config, "/api/referrals/confirm", {
    session_key: input.referralSessionKey,
    system_key: COMMON_HUB_SYSTEM_KEY,
    external_user_id: input.externalUserId,
    email: input.email ?? undefined,
    relation_type: "referral",
    referral_source: input.referralSource,
    locked: true,
    metadata: input.metadata ?? undefined,
  });
  return result !== null;
}
