import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SenNoKuniHubAuthError,
  verifySenNoKuniHubIdentity,
} from "@/modules/integrations/application/verify-sen-no-kuni-hub-request";
import { buildV1SignedPayload, buildV2CanonicalString } from "@/modules/integrations/domain/sen-no-kuni-hub-signature";
import type { SenNoKuniHubSettingsRepository, SenNoKuniHubSettingsRow } from "@/modules/integrations/application/ports";

// 千ノ国パスポート Phase C-0(§10 HMACテスト・§13 Repository回帰テスト)。
// application層(verifySenNoKuniHubIdentity)がNextRequestに依存せず、正しいHMAC検証
// ロジックを実装していることを、実際のHMAC計算(node:crypto)を使って検証する。
// DBを使わないため、Supabase localの有無に関わらず常に実行できる。

const HMAC_SECRET = "test-secret";
const SYSTEM_KEY = "system-a";

class FakeSettingsRepository implements SenNoKuniHubSettingsRepository {
  settings: SenNoKuniHubSettingsRow | null = { system_key: SYSTEM_KEY, hmac_secret: HMAC_SECRET, enabled: true, v1_disabled_at: null };
  usedNonces = new Set<string>();
  v1UsageRecordedFor: string[] = [];

  async findByKeyId(keyId: string): Promise<SenNoKuniHubSettingsRow | null> {
    return keyId === "key-1" ? this.settings : null;
  }
  async insertNonceIfUnused(keyId: string, nonce: string): Promise<boolean> {
    const compound = `${keyId}:${nonce}`;
    if (this.usedNonces.has(compound)) return false;
    this.usedNonces.add(compound);
    return true;
  }
  async recordV1Usage(keyId: string): Promise<void> {
    this.v1UsageRecordedFor.push(keyId);
  }
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", HMAC_SECRET).update(payload).digest("hex");
}

function v1Headers(overrides: Partial<Record<string, string | null>> = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = "nonce-1";
  const rawBody = '{"hello":"world"}';
  const signature = sign(buildV1SignedPayload(timestamp, rawBody));
  return {
    headers: {
      keyId: "key-1",
      timestamp,
      nonce,
      signature,
      signatureVersionHeader: null,
      eventVersionHeader: null,
      idempotencyKeyHeader: null,
      ...overrides,
    },
    rawBody,
  };
}

function v2Headers(overrides: Partial<Record<string, string | null>> = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = "nonce-2";
  const eventVersion = "1";
  const idempotencyKey = "idem-1";
  const rawBody = '{"hello":"world"}';
  const signature = sign(
    buildV2CanonicalString({ keyId: "key-1", timestamp, nonce, eventVersion, idempotencyKey, rawBody })
  );
  return {
    headers: {
      keyId: "key-1",
      timestamp,
      nonce,
      signature,
      signatureVersionHeader: "2",
      eventVersionHeader: eventVersion,
      idempotencyKeyHeader: idempotencyKey,
      ...overrides,
    },
    rawBody,
  };
}

describe("verifySenNoKuniHubIdentity", () => {
  it("accepts a valid v1 signature (header omitted = v1)", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v1Headers();
    const identity = await verifySenNoKuniHubIdentity(repo, headers, rawBody);
    expect(identity).toEqual({ systemKey: SYSTEM_KEY, signatureVersion: "1" });
    expect(repo.v1UsageRecordedFor).toEqual(["key-1"]);
  });

  it("accepts a valid v2 signature", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v2Headers();
    const identity = await verifySenNoKuniHubIdentity(repo, headers, rawBody);
    expect(identity).toEqual({ systemKey: SYSTEM_KEY, signatureVersion: "2" });
    expect(repo.v1UsageRecordedFor).toHaveLength(0); // v2ではv1利用ログを記録しない
  });

  it("rejects when a required header is missing", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v1Headers({ nonce: null });
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "missing_headers" });
  });

  it("rejects an unsupported signature version header", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v1Headers({ signatureVersionHeader: "3" });
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "invalid_signature_version" });
  });

  it("rejects v2 requests missing X-Event-Version/Idempotency-Key", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v2Headers({ eventVersionHeader: null });
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "missing_headers" });
  });

  it("rejects an unknown key_id", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v1Headers({ keyId: "unknown-key" });
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "unknown_key" });
  });

  it("rejects a disabled integration", async () => {
    const repo = new FakeSettingsRepository();
    repo.settings!.enabled = false;
    const { headers, rawBody } = v1Headers();
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "disabled" });
  });

  it("rejects v1 signatures once v1_disabled_at has passed", async () => {
    const repo = new FakeSettingsRepository();
    repo.settings!.v1_disabled_at = new Date(Date.now() - 60_000).toISOString();
    const { headers, rawBody } = v1Headers();
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "v1_disabled" });
  });

  it("still accepts v1 signatures before v1_disabled_at", async () => {
    const repo = new FakeSettingsRepository();
    repo.settings!.v1_disabled_at = new Date(Date.now() + 60_000).toISOString();
    const { headers, rawBody } = v1Headers();
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).resolves.toMatchObject({ signatureVersion: "1" });
  });

  it("rejects an expired timestamp (outside the 5-minute clock skew)", async () => {
    const repo = new FakeSettingsRepository();
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 6 * 60);
    const rawBody = '{"hello":"world"}';
    const signature = sign(buildV1SignedPayload(staleTimestamp, rawBody));
    const headers = {
      keyId: "key-1",
      timestamp: staleTimestamp,
      nonce: "nonce-x",
      signature,
      signatureVersionHeader: null,
      eventVersionHeader: null,
      idempotencyKeyHeader: null,
    };
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "invalid_timestamp" });
  });

  it("rejects a tampered signature", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v1Headers();
    headers.signature = sign("wrong-payload");
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "invalid_signature" });
  });

  // key_idとtimestampは署名検証より前段の検証(鍵解決・timestamp形式チェック)で弾かれるため、
  // 期待するエラーコードがnonce/event_version/idempotency_keyとは異なる。すべて「拒否される」
  // ことに変わりはないが、実際の検証順序(§10.2「すべて署名不一致になること」の実装上の解釈)
  // を反映して期待値を分けている。
  it.each([
    ["keyId", "unknown_key"],
    ["timestamp", "invalid_timestamp"],
    ["nonce", "invalid_signature"],
    ["eventVersion", "invalid_signature"],
    ["idempotencyKey", "invalid_signature"],
  ] as const)("v2: tampering with %s is rejected (%s)", async (field, expectedCode) => {
    const repo = new FakeSettingsRepository();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "nonce-tamper";
    const eventVersion = "1";
    const idempotencyKey = "idem-tamper";
    const rawBody = '{"hello":"world"}';
    const signature = sign(buildV2CanonicalString({ keyId: "key-1", timestamp, nonce, eventVersion, idempotencyKey, rawBody }));

    const headers = {
      keyId: "key-1",
      timestamp,
      nonce,
      signature,
      signatureVersionHeader: "2",
      eventVersionHeader: eventVersion,
      idempotencyKeyHeader: idempotencyKey,
    };
    const tamperedHeaderKey = {
      keyId: "keyId",
      timestamp: "timestamp",
      nonce: "nonce",
      eventVersion: "eventVersionHeader",
      idempotencyKey: "idempotencyKeyHeader",
    }[field];
    (headers as Record<string, string>)[tamperedHeaderKey] += "-tampered";

    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: expectedCode });
  });

  it("v2: tampering with raw_body invalidates the signature", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v2Headers();
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody + "tampered")).rejects.toMatchObject({ code: "invalid_signature" });
  });

  it("rejects a replayed nonce", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v1Headers();
    await verifySenNoKuniHubIdentity(repo, headers, rawBody);
    await expect(verifySenNoKuniHubIdentity(repo, headers, rawBody)).rejects.toMatchObject({ code: "replayed_nonce" });
  });

  it("exposes SenNoKuniHubAuthError as a real Error subclass with a code", async () => {
    const repo = new FakeSettingsRepository();
    const { headers, rawBody } = v1Headers({ keyId: "unknown-key" });
    try {
      await verifySenNoKuniHubIdentity(repo, headers, rawBody);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SenNoKuniHubAuthError);
      expect(error).toBeInstanceOf(Error);
    }
  });
});
