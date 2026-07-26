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
//
// 千ノ国パスポート PR #147マージ前最終修正指示§4。以前はIdempotency-Keyを毎回
// randomUUID()で生成していたため、「外部送信自体は成功したがその後のDB更新
// (outboxのmarkSent等)前にプロセスが落ちた」場合の再送(integration-outbox/drain)が
// 毎回別のIdempotency-Keyを送ってしまい、sengoku-ai.com側の重複排除が機能しなかった。
// 呼び出し元が同一の論理イベントに対して安定したキー(outbox event id等)を渡せるよう
// 引数化し、渡されなかった場合のみrandomUUID()にフォールバックする。
async function postToAgencySystem(
  config: OutboundConfig,
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string = randomUUID()
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "Idempotency-Key": idempotencyKey,
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

// ガイド9.1章 POST /api/common-users/resolve。create_if_missing:trueのため、再試行時に
// 毎回異なるIdempotency-Keyを送ると重複したcommon_userが作られかねない。同一ユーザーの
// 解決要求は常に同じキーになるよう、externalUserIdから安定したキーを作る(§4)。
export async function resolveCommonUserId(input: ResolveCommonUserInput): Promise<string | null> {
  const config = await getOutboundConfig();
  if (!config) return null;

  const result = await postToAgencySystem(
    config,
    "/api/common-users/resolve",
    {
      system_key: COMMON_HUB_SYSTEM_KEY,
      external_user_id: input.externalUserId,
      email: input.email ?? undefined,
      display_name: input.displayName ?? undefined,
      create_if_missing: true,
    },
    `common-user-resolve:${input.externalUserId}`
  );

  const commonUserId = result?.common_user_id;
  return typeof commonUserId === "string" && commonUserId.length > 0 ? commonUserId : null;
}

// ガイド10.1章 POST /api/referrals/capture。session_keyは戦国パスポート側では発行せず
// sengoku-ai.com側の発行値を使う(問い合わせ回答で確認済みの推奨方式)。referral_tokenは
// 一度きりのトークンのため、そのままキーに使えば同一トークンの再試行が常に同じ
// Idempotency-Keyになる(§4)。
export async function captureReferral(referralToken: string): Promise<string | null> {
  const config = await getOutboundConfig();
  if (!config) return null;

  const result = await postToAgencySystem(
    config,
    "/api/referrals/capture",
    {
      referral_token: referralToken,
      system_key: COMMON_HUB_SYSTEM_KEY,
      event_type: "capture",
    },
    `referral-capture:${referralToken}`
  );

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
//
// 千ノ国パスポート PR #147マージ前最終修正指示§4。idempotencyKeyは呼び出し元が
// 同一の論理イベント(同一outbox行の再送、同一ユーザーの登録確定)に対して常に
// 同じ値を渡すこと。購入確定は同一ユーザー・同一referral_source内でも購入ごとに
// 別イベントのため(referralSessionKey単体では複数購入を区別できない)、購入経路の
// 呼び出し元は必ずoutbox event id等の一意なキーを明示的に渡す。
export async function confirmReferral(input: ConfirmReferralInput, idempotencyKey?: string): Promise<boolean> {
  const config = await getOutboundConfig();
  if (!config) return false;

  const result = await postToAgencySystem(
    config,
    "/api/referrals/confirm",
    {
      session_key: input.referralSessionKey,
      system_key: COMMON_HUB_SYSTEM_KEY,
      external_user_id: input.externalUserId,
      email: input.email ?? undefined,
      relation_type: "referral",
      referral_source: input.referralSource,
      locked: true,
      metadata: input.metadata ?? undefined,
    },
    idempotencyKey
  );
  return result !== null;
}
