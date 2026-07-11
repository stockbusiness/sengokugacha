# 代理店システム(sengoku-ai.com)連携 実装計画

対象仕様書(アップロード資料、Version 3.6.40/3.6.45):
- 代理店連携API仕様書
- 代理店システム連携 開発者向け説明書
- 代理店システム SSO連携仕様書

方針確認結果(ユーザー回答):
- データ同期(受信API)+ SSOログイン(代理店ポータル)を一括実装
- 双方向同期(このアプリで作成した代理店もsengoku-ai.comへ送信)
- 階層(親子関係)は表示・参照のみ。報酬按分ロジックは実装しない
- sengoku-ai.com側の接続情報(エンドポイントURL・APIキー)は用意済み。実際の値は管理画面から入力する運用とする(チャット上でのキー共有は避ける)

## 1. 既存実装との対応

- `agents.rank`(`アドバイザー`/`ディレクター`/`エージェント`)は仕様書の`role_level` 1/2/3の`role_label`と完全一致 → 受信データの`role_level`から`rank`を自動マッピングする。
- `agents`テーブルは現状フラット構造で`external_id`・階層・連絡先・状態列が存在しない → 今回追加する。
- 代理店本人がログインできる画面は存在しない → SSO受信(RP)側として新設する(`/agency/**`)。これは既存の未解決課題「代理店は紹介URLをどこで確認できますか」の解決策も兼ねる。
- APIキー・外部連携設定の保存先は存在しない → `payment_settings`/`line_settings`と同じ「シングルトン設定テーブル」パターンで新設する。
- 内覧トークンで採用した「ランダム値+SHA-256ハッシュ」方式(`src/lib/metaverse.ts`の`hashToken`)を、このアプリが発行する受信用APIキーの保存にも流用する。

## 2. DBスキーマ

`agents`テーブルへの追加列:
- `external_id text unique`(sengoku-ai.com発行の代理店コード。ローカル作成の代理店は自動採番)
- `parent_agent_id uuid references agents(id)`(解決済みの親、表示専用)
- `parent_external_id text`(未解決の親のexternal_id。後から解決するために保持)
- `contact_email text` / `login_email text` / `phone text` / `line_url text`
- `status text not null default 'active' check (status in ('active','inactive'))`
- `role_level int`
- `source text not null default 'local' check (source in ('local','sengoku-ai'))`
- `lp_urls jsonb`
- `updated_at timestamptz not null default now()`

新規テーブル:
- `agency_integration_settings`(シングルトン): 受信用APIキーのハッシュ、送信先URL・送信用APIキー、双方向同期ON/OFF、SSO設定(issuer/jwks url/audience)、SSO ON/OFF
- `agency_sso_used_jti`: SSOトークンの再利用防止(`jti`一意制約、`expires_at`にインデックス)

## 3. 実装するAPI

受信側(sengoku-ai.com → このアプリ):
- `POST /api/integrations/agencies`(仕様書指定の固定パス。管理画面認証ではなくAPIキー認証)

送信側(このアプリ → sengoku-ai.com、双方向同期ON時のみ):
- 管理画面での代理店の新規作成・更新時に、best-effortでPOST送信(失敗しても本体処理は継続、ログのみ記録)

管理画面向け:
- `/admin/agency-integration`: 接続設定(送信先URL・送信用APIキー・SSO設定)、受信用APIキーの発行・再発行、双方向同期/SSOのON/OFFトグル、接続テスト、手動階層同期

代理店ポータル(SSO受信側、新設):
- `GET /agency/sso?token=...`: JWT検証 → 代理店セッションCookie発行 → `/agency`へリダイレクト
- `/agency`: 紹介URL・自分の売上ログ・配下代理店の階層(表示のみ)
- `/agency/login`: 未ログイン・エラー時の案内ページ

## 4. 実装順序

1. マイグレーション + `src/lib/agents.ts`(新設。既存はAPIルートに直書きだったため今回集約)
2. 受信API + 管理画面の接続設定UI・受信用APIキー発行
3. 送信側(双方向同期)の組み込み + 手動階層同期
4. SSO検証ロジック(`src/lib/agency-sso.ts`) + `/agency/**`ポータル + 代理店セッション(`src/lib/agent-session.ts`)
5. 検証(tsc/lint/vitest/build)・ドキュメント更新・コミット

## 5. 今回のスコープ外(明記)

- 階層に応じた報酬按分計算(表示のみの方針のため)
- sengoku-ai.com側の実装(このアプリはRP/受信側としてのみ動く)
- 実際の本番接続テスト(APIキー・URLは管理画面から入力後にユーザー側で実施)
