# 戦国パスポート 外部開発者向け連携ガイド

Version: 1.0
対象システム: 戦国パスポート(本リポジトリ)
対象読者: `sengoku-ai.com` 代理店システムの開発担当者、その他戦国パスポートと連携する外部サービスの開発担当者

sengoku-ai.com側の `EXTERNAL_DEVELOPER_GUIDE.md`(外部開発者向け連携ガイド v3.6.78-draft)に対応する、戦国パスポート側の実装仕様書。用語・章立ては可能な限り揃えている。

---

## 1. この連携の目的

戦国パスポートは、`sengoku-ai.com` 代理店システムを代理店構造・紹介元・共通顧客IDの中心HUBとして扱う。戦国パスポート側では以下を行う。

- 代理店の作成・更新イベントを受信し、自サービス内の代理店マスタ(`agents`テーブル)に反映する
- 代理店システムへ代理店構造を発信する(双方向同期がONの場合)
- ユーザー登録・紹介URL流入・購入確定のタイミングで、共通顧客ID・紹介成果を代理店システムへ通知する
- 代理店システムからのSSOログインを受け付ける

## 2. 用語

sengoku-ai.com側のガイドと同じ用語を使う。

| 用語 | 意味 |
|---|---|
| `system_key` | 戦国パスポートの識別キー。**`sengoku-passport` で固定**(サービス表示名が変わっても変更しない) |
| `agent_code` | 代理店の公開識別子。戦国パスポート側では `agents.external_id`(= `agents.referral_code`)に対応 |
| `common_user_id` | 複数サービスを横断する共通顧客ID。戦国パスポート側では `users.common_user_id` に保存 |
| `external_user_id` / `service_user_id` | 戦国パスポート側のユーザーID。`users.id`(UUID)を使う |
| `referral_token` | 紹介トークン。戦国パスポートの `?ref=` リンクは自前の代理店ポータルで発行した `agent_code` を使っており、sengoku-ai.com側LP発行の `referral_token` とは発行元が異なる可能性がある(9章参照) |

## 3. APIキー

sengoku-ai.com側のガイド3章と同じ2方向モデル。

| 種類 | 発行元 | 戦国パスポート側の保存先 | 用途 |
|---|---|---|---|
| AI受信用APIキー | sengoku-ai.com | `agency_integration_settings.outbound_api_key` | 戦国パスポート→sengoku-ai.comへの送信に使用 |
| 外部サービス受信用APIキー | 戦国パスポート | `agency_integration_settings.inbound_api_key_hash`(ハッシュのみ保存) | sengoku-ai.com→戦国パスポートへの送信の検証に使用 |

いずれも管理画面 `/admin/agency-integration` から発行・設定する。

### 3.1 sengoku-ai.comから戦国パスポートへ送る場合

以下のいずれかのヘッダーで認証する。

```http
x-api-key: {外部サービス受信用APIキー}
```
```http
Authorization: Bearer {外部サービス受信用APIキー}
```

### 3.2 戦国パスポートからsengoku-ai.comへ送る場合

```http
x-api-key: {AI受信用APIキー}
```

POST系の送信には `Idempotency-Key` ヘッダー(UUID)を付与する(6.2章のガイド推奨に準拠)。

## 4. 戦国パスポートが受信するAPI

```http
POST https://（戦国パスポートのドメイン）/api/integrations/agencies
```

実装: `src/app/api/integrations/agencies/route.ts`

### 4.1 認証

`x-api-key` または `Authorization: Bearer` のいずれか。不正な場合は `401` + `{ "success": false, "message": "Unauthorized" }`。

### 4.2 対応イベント

| イベント | 処理 |
|---|---|
| `connection_test`(または`dry_run: true`) | 認証確認のみ。データは保存しない |
| `admin_created` / `admin_updated` / `role_updated` / `approved` / `promoted` / `deactivated` / `deleted` | 代理店のupsert処理(`external_id`必須、詳細は4.3) |
| 上記以外(`lead_created` / `common_user.merged` / `common_user.assigned_agent.updated` 等) | **`200`で受理し処理対象外として無視する**(未対応実装のため。相手側の失敗ログ・再送ループを防ぐための堅牢化) |
| `event`フィールド省略 | 常に代理店upsert処理として扱う(戦国パスポート自身が送る`pushAgentToExternal()`のリクエストは`event`を付けないため) |

### 4.3 代理店upsertのリクエスト例

```json
{
  "external_id": "rr-agent-001",
  "parent_external_id": "rr-parent-001",
  "name": "外部側代理店名",
  "contact_name": "担当者名",
  "contact_email": "contact@example.com",
  "login_email": "login@example.com",
  "phone": "09000000000",
  "line_url": "https://lin.ee/example",
  "status": "active",
  "role_level": 3,
  "role_label": "エージェント",
  "lp_urls": []
}
```

`external_id`・`name` は必須(未指定時は`422`)。`parent_external_id`が指す親がまだ戦国パスポート側に存在しない場合はエラーにせず未解決のまま保存し、後で親データが届いた時点で解決する。

### 4.4 レスポンス例

```json
{ "success": true, "data": { "external_id": "rr-agent-001", "status": "active", "synced": true, "action": "created" } }
```

**注意**: 現状のエラーレスポンス形式は `{ "success": false, "message": "..." }` であり、sengoku-ai.com側ガイド13章が定める `{ "ok": false, "error": { "code", "message" } }` 形式とは異なる(未対応、9章参照)。

## 5. SSOログイン受信

```http
GET https://（戦国パスポートのドメイン）/agency/sso?token={JWT}
```

実装: `src/app/agency/sso/route.ts` / `src/lib/agency-sso.ts`

- `RS256` + JWKS(`agency_integration_settings.sso_jwks_url`)で検証
- `iss`(`sso_issuer_url`)・`aud`(`sso_audience`)・`exp`を確認
- `jti`は`agency_sso_used_jti`テーブルのunique制約でワンタイム利用を強制(リプレイ防止)
- `sub`(=`agent_code`)で`agents.external_id`を照合し、一致すれば戦国パスポートのセッションCookieを発行して`/agency`(代理店ポータル)へリダイレクト
- 検証失敗時は`/agency/login?error={code}`へリダイレクト(`code`は`agency_not_linked`/`agency_inactive`/`sso_expired`/`sso_replayed`/`sso_disabled`のいずれか)

## 6. 戦国パスポートが発信するAPI

いずれも `agency_integration_settings.outbound_api_key` が未設定の場合は何も送信しない(フェイルオープン)。

| API | 呼び出しタイミング | 実装 |
|---|---|---|
| `GET /api/hierarchy.php` | 管理画面「階層を手動で全件同期」ボタン押下時 | `src/lib/agents.ts` `syncHierarchyFromAgency()` |
| `POST /api/integrations/agencies` | 戦国パスポート側で代理店を作成・編集した時(双方向同期ON時のみ) | `src/lib/agents.ts` `pushAgentToExternal()` |
| `POST /api/common-users/resolve` | ユーザーのログイン確定時、`users.common_user_id`が未解決の場合のみ | `src/lib/passport.ts` `syncCommonUserHub()` → `src/lib/common-user-hub.ts` `resolveCommonUserId()` |
| `POST /api/referrals/capture` | `?ref=`付きURLへ新規到達した時点(LIFF初期化前) | `src/lib/client/ensure-liff-session.ts` → `/api/referrals/capture`(中継)→ `captureReferral()` |
| `POST /api/referrals/confirm` | ①新規登録確定時、②購入完了時(Stripe webhook)。いずれも`users.referral_session_key`が保存されている場合のみ | `syncCommonUserHub()` / `src/app/api/stripe/webhook/route.ts` `confirmReferralForPurchase()` → `confirmReferral()` |

### 6.1 共通の送信仕様

- `system_key`は常に`sengoku-passport`
- `external_user_id`には戦国パスポートの`users.id`(UUID)を使う
- リクエスト送信は全てタイムアウト5秒(`AbortSignal.timeout(5000)`)。タイムアウト・ネットワークエラー・非2xxレスポンス(`403 FEATURE_DISABLED`・`503 COMMON_HUB_SCHEMA_NOT_READY`等を含む)は全て握りつぶし、呼び出し元の主処理(ログイン・登録・購入)を止めない。失敗時は`console.warn`/`console.error`にログを残すのみ

### 6.2 `POST /api/common-users/resolve` の送信例

```json
{
  "system_key": "sengoku-passport",
  "external_user_id": "1e2a3b4c-...",
  "display_name": "ユーザー名",
  "create_if_missing": true
}
```

レスポンスの`common_user_id`を`users.common_user_id`へ保存する(`common_user_synced_at`も更新)。

### 6.3 `POST /api/referrals/capture` の送信例

```json
{
  "referral_token": "（?ref=の値。戦国パスポート側agent_code)",
  "system_key": "sengoku-passport",
  "event_type": "capture"
}
```

レスポンスの`session_key`を`sessionStorage`(ブラウザ側)経由で保持し、新規登録確定時に`users.referral_session_key`へ永続化する。

### 6.4 `POST /api/referrals/confirm` の送信例(購入確定時)

```json
{
  "session_key": "（capture時に保存したreferral_session_key）",
  "system_key": "sengoku-passport",
  "external_user_id": "1e2a3b4c-...",
  "relation_type": "referral",
  "referral_source": "purchase",
  "locked": true,
  "metadata": { "purchase_id": "...", "item_type": "kokudaka", "amount": 3000 }
}
```

新規登録確定時は`referral_source: "registration"`で送信する。

## 7. 管理画面での設定手順

`/admin/agency-integration`(本部管理者ロール限定)から以下を行う。

1. 「受信用APIキー」を発行し、sengoku-ai.com側の「外部API連携」設定にコピーする
2. sengoku-ai.com側が発行した「AI受信用APIキー」を「sengoku-ai.com受信用APIキー」欄に入力する
3. 送信先URL(通常`https://sengoku-ai.com`)を設定する
4. 必要に応じて「双方向同期」「SSOログイン」を有効にする
5. 「接続テスト」で疎通確認する

## 8. データモデル(戦国パスポート側)

| テーブル・カラム | 役割 |
|---|---|
| `agents.external_id` / `agents.referral_code` | sengoku-ai.com側の`agent_code`に対応 |
| `agents.parent_agent_id` / `agents.parent_external_id` | 代理店階層(自己参照FK) |
| `agency_integration_settings` | APIキー・エンドポイントURL・SSO設定のシングルトン |
| `agency_sso_used_jti` | SSO JWTの`jti`ワンタイム利用管理 |
| `users.referring_agent_id` | ファーストタッチの紹介代理店(登録時のみ確定、以後変更不可) |
| `users.common_user_id` / `users.common_user_synced_at` | 共通顧客ID解決結果 |
| `users.referral_session_key` | `referrals/capture`で取得したsession_key(登録確定時に保存し、購入確定時にも再利用) |

## 9. 既知の未確認・未実装事項

- **`referral_token`の発行元不一致(要確認)**: 戦国パスポートの`?ref=`リンクは自前の代理店ポータルで発行した`agent_code`であり、sengoku-ai.com側ガイドが想定する「LP発行の`referral_token`」とは発行元が異なる可能性がある。`referrals/capture`が期待通り解決できるか、sengoku-ai.com側での確認が必要
- **`POST /api/common-users/{id}/system-links`は未実装**: 複数外部サービス間でのID追加紐づけには対応していない(ガイド9.3章、14.1の必須要件には含まれない)
- **エラーレスポンス形式が未統一**: `/api/integrations/agencies`は`{ "success": false, "message": "..." }`を返す。sengoku-ai.com側ガイド13章の`{ "ok": false, "error": { "code", "message" } }`形式への統一は未対応
- **既存ユーザーへの`common_user_id`遡及発行**: 現状は新規ログイン時に未解決の場合のみ解決する方式。既存ユーザー全件への一括発行バッチは未実装
- **`include_sso=1`パラメータ未使用**: 階層取得APIを呼ぶ際、SSO起動URLは固定パターン(`sso_launch.php?client=sengoku-passport`)で組み立てており、`include_sso=1`は指定していない

---

*関連ドキュメント: `docs/sengoku-ai-external-developer-guide-diff-report.md`、`docs/sengoku-no-kuni-5-system-policy-diff-report.md`*
