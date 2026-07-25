import { beforeEach, describe, expect, it, vi } from "vitest";

// 千ノ国パスポート PR #147マージ前最終修正指示§4。
// 「外部送信自体(sengoku-ai.comへのPOST)は成功したが、その後のDB更新
// (outbox行のmarkSent等)より前にプロセスが落ちた」場合、次のドレイン/再試行が
// 同じ論理イベントを再送する。以前はIdempotency-Keyを毎回randomUUID()で生成して
// いたため、この再送が「別のリクエスト」として扱われ、sengoku-ai.com側の重複排除が
// 機能しなかった。ここでは、呼び出し元が渡した安定キーがそのままヘッダーに載ることと、
// 同一キーでの2回呼び出し(=クラッシュ後の再送を模したシナリオ)が同じ
// Idempotency-Keyになることを検証する。

const { getAgencyIntegrationSettingsMock } = vi.hoisted(() => ({
  getAgencyIntegrationSettingsMock: vi.fn(),
}));

vi.mock("@/lib/agents", () => ({
  getAgencyIntegrationSettings: getAgencyIntegrationSettingsMock,
}));

import { confirmReferral, resolveCommonUserId, captureReferral } from "@/lib/common-user-hub";

function mockFetchOk(body: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    text: async () => "",
  });
}

beforeEach(() => {
  getAgencyIntegrationSettingsMock.mockReset().mockResolvedValue({
    outbound_api_key: "test-api-key",
    sso_issuer_url: "https://sengoku-ai.example",
  });
  vi.stubGlobal("fetch", mockFetchOk());
});

describe("confirmReferral: idempotency key(§4)", () => {
  it("呼び出し元が渡したidempotencyKeyをそのままIdempotency-Keyヘッダーに使う", async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal("fetch", fetchMock);

    await confirmReferral(
      { referralSessionKey: "session-1", externalUserId: "user-1", referralSource: "purchase" },
      "outbox:integration_outbox_events:outbox-id-123"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["Idempotency-Key"]).toBe("outbox:integration_outbox_events:outbox-id-123");
  });

  it("同一outbox行に対する再送(クラッシュ後の再試行を模擬)は毎回同じIdempotency-Keyを送る", async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const input = { referralSessionKey: "session-1", externalUserId: "user-1", referralSource: "purchase" as const };
    const idempotencyKey = "outbox:integration_outbox_events:outbox-id-999";

    // 1回目: 送信成功したがmarkSent前にプロセスが落ちたと仮定。
    await confirmReferral(input, idempotencyKey);
    // 2回目: drainによる再送。
    await confirmReferral(input, idempotencyKey);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstKey = fetchMock.mock.calls[0][1].headers["Idempotency-Key"];
    const secondKey = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    expect(firstKey).toBe(idempotencyKey);
    expect(secondKey).toBe(idempotencyKey);
  });

  it("idempotencyKeyを渡さない場合は呼び出しごとに異なるキーになる(後方互換のフォールバック)", async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const input = { referralSessionKey: "session-1", externalUserId: "user-1", referralSource: "registration" as const };
    await confirmReferral(input);
    await confirmReferral(input);

    const firstKey = fetchMock.mock.calls[0][1].headers["Idempotency-Key"];
    const secondKey = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    expect(firstKey).not.toBe(secondKey);
  });
});

describe("resolveCommonUserId / captureReferral: 安定したidempotency key(§4)", () => {
  it("resolveCommonUserIdは同一externalUserIdなら常に同じIdempotency-Keyを送る", async () => {
    const fetchMock = mockFetchOk({ common_user_id: "common-1" });
    vi.stubGlobal("fetch", fetchMock);

    await resolveCommonUserId({ externalUserId: "user-42" });
    await resolveCommonUserId({ externalUserId: "user-42" });

    const firstKey = fetchMock.mock.calls[0][1].headers["Idempotency-Key"];
    const secondKey = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    expect(firstKey).toBe(secondKey);
  });

  it("captureReferralは同一referral_tokenなら常に同じIdempotency-Keyを送る", async () => {
    const fetchMock = mockFetchOk({ session_key: "session-abc" });
    vi.stubGlobal("fetch", fetchMock);

    await captureReferral("token-xyz");
    await captureReferral("token-xyz");

    const firstKey = fetchMock.mock.calls[0][1].headers["Idempotency-Key"];
    const secondKey = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    expect(firstKey).toBe(secondKey);
  });
});
