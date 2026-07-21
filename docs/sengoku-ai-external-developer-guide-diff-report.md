# 「千ノ国 代理店システム 外部開発者向け連携ガイド v3.6.78-draft」現行実装差分報告

本ドキュメントは、`sengoku-ai.com`代理店システムが提示する外部開発者向け連携ガイド(以下「ガイド」)と、現行実装(本リポジトリ=戦国パスポート)との技術的な差分を調査した報告書である。`docs/sengoku-no-kuni-5-system-policy-diff-report.md`が扱った「共通顧客HUB」構想の**具体的なAPI仕様**に相当するため、両報告書は対で参照されたい。

> **【2026-08-07 追記】** 本報告書の作成後、`common_user_id`・紹介連携・共通顧客HUBイベントの一部受信を実装した(下記参照)。以下の§0〜§6は**作成当時の内容をそのまま残してある**(調査記録としての正確性を優先)。実装済みとなった項目には章末に更新メモを付記する。最新の実装仕様は`docs/sengoku-passport-external-developer-guide.md`および`docs/sen-no-kuni-integration-completion-report.md`を参照。
>
> - `POST /api/common-users/resolve` / `POST /api/referrals/capture` / `POST /api/referrals/confirm` は実装済み(PR#92〜94、`src/lib/common-user-hub.ts`)。§2-1・§2-2は解消。
> - `/api/integrations/agencies`の`common_user.merged`・`common_user.assigned_agent.updated`は実装済み(PR#101、`src/lib/agency-events.ts`)。`lead_created`は引き続き未対応(200受理・無視)。§2-3は部分的に解消。
> - 新規エンドポイント`POST /api/integrations/sen-no-kuni-hub`(PR#103・#104)では、`{ "ok": false, "error": { "code", "message" } }`形式・`Idempotency-Key`ヘッダーの双方に対応済み(§2-4・§2-5)。ただし**既存の`/api/integrations/agencies`(sengoku-ai.com向け)自体の形式は変更していない**。sengoku-ai.com側がこの新形式・新エンドポイントを採用する予定があるかは別途確認が必要。

---

## 0. 総論

現行実装には、ガイドが定義する連携のうち**「代理店組織の階層同期」と「SSOログイン」の2系統のみ**が実装済みである。ガイドが新たに定義する**「共通顧客ID(`common_user_id`)」「紹介・成果連携(`referrals/capture`・`referrals/confirm`)」「共通顧客HUBイベント受信」は全く実装されていない**。

これは方針書v2.1/v3.0の調査結果(`users.referring_agent_id`という単一カラムのみで、`common_user_id`概念自体が存在しない)と完全に整合する。つまり、ガイドが求める連携を実装することは、方針書が求める「共通顧客HUB」構想を実現するための具体的な第一歩そのものである。

---

## 1. 実装済みで、ガイドとほぼ一致している部分

| ガイドの要求(章) | 現行実装 | 一致度 |
|---|---|---|
| 2種類のAPIキーの分離管理(3章) | `agency_integration_settings`テーブル。`inbound_api_key_hash`(=ガイドの「外部サービス受信用APIキー」、sengoku-aiからの着信を検証)と`outbound_api_key`(=ガイドの「AI受信用APIキー」、sengoku-aiへの発信に使用)を分離管理。方向の対応も正しい | **一致** |
| `agent_code`を外部キーとして使う(4章) | `agents.external_id`が実質的に`agent_code`として使われ、新規作成時に`referral_code`へもコピーされる(`src/lib/agents.ts` `upsertAgentFromSync()` 171行目) | **一致** |
| 代理店階層取得API `GET /api/hierarchy.php`(7章) | `syncHierarchyFromAgency()`が`format=tree&include_contact=1&root_code=...`で呼び出し、ツリーを平坦化して`upsertAgentFromSync()`に流し込む(`src/lib/agents.ts` 297-323行目) | **一致**(`include_sso=1`パラメータは未使用) |
| 代理店同期API `POST /api/integrations/agencies`(8章、外部→AI方向) | `pushAgentToExternal()`が`outbound_endpoint_url`(既定で`/api/integrations/agencies`を補完)へ`x-api-key`付きでPOST(`src/lib/agents.ts` 192-233行目) | **概ね一致**(`default_commission_rate`は送信していない) |
| 代理店同期API 受信側(11章、AI→外部方向の一部) | `src/app/api/integrations/agencies/route.ts`が`x-api-key`/`Bearer`を検証し、`connection_test`と代理店upsertを処理 | **部分一致**(下記2章参照) |
| SSO(12章) | `src/lib/agency-sso.ts` `verifyAgencySsoToken()`。JWKS取得、`RS256`検証、`iss`/`aud`/`exp`確認、`jti`のワンタイム利用チェック(`agency_sso_used_jti`テーブルのunique制約で二重使用防止)まで、ガイド12.5の検証手順をほぼ網羅 | **一致** |

---

## 2. 未実装・不一致の部分

### 2-1. 共通顧客ID(9章)

`POST /api/common-users/resolve`・`GET /api/common-users/{common_user_id}`・`POST /api/common-users/{common_user_id}/system-links`のいずれも、呼び出し元・受信先ともに**存在しない**。ユーザー登録時に`common_user_id`を発行・照合する処理がなく、方針書が求める「同一人物の横断管理」はこのガイドが提供するAPIを使わない限り実現しない。

### 2-2. 紹介・成果連携(10章)

`POST /api/referrals/capture`・`POST /api/referrals/confirm`は**未実装**。現行の紹介記録は、`?ref=`パラメータを`sessionStorage`に一時保存し、新規登録時に`resolveAgentIdByReferralCode()`(`src/lib/passport.ts`)で`users.referring_agent_id`へ一度だけ書き込むという**完全にローカル完結の仕組み**であり、代理店システム側への通知は一切行われない。

このため、現状は以下が起きている可能性が高い。
- sengoku-ai.com側の代理店が、戦国パスポート経由の紹介・成約実績を正しく把握できていない(代理店システム側の`agency_relations`に反映されない)。
- ガイド10.1の`session_key`・`referral_token`という、複数ページ遷移をまたいだ紹介追跡の仕組みが存在しない。

### 2-3. 共通顧客HUBイベントの受信(11.1章)

`/api/integrations/agencies`(受信側)は、実質的に「代理店の作成・更新」と「接続テスト」のみを処理する実装になっており、ガイドが列挙する以下のイベント種別を区別・処理していない。

- `role_updated` / `approved` / `promoted` / `deactivated` / `deleted`(代理店のライフサイクルイベント)
- `lead_created`(LP問い合わせ)
- `common_user.merged`(共通顧客ID統合)
- `common_user.assigned_agent.updated`(担当代理店変更)

現在の受信ハンドラは`body.external_id`と`body.name`を必須としているため、`common_user.merged`のようなペイロード(`common_user_id`のみを持ち`external_id`/`name`を持たない)を受信すると、**422エラーで拒否される**(または`event`フィールドの分岐が無いため意図しない代理店upsert処理に誤って渡る可能性がある)。sengoku-ai.com側でこれらのイベント配信が既に有効化されている場合、現状は全て失敗しているか、無視されている可能性が高い。

### 2-4. エラーレスポンス形式(13章)

ガイドは`{ "ok": false, "error": { "code", "message" } }`という形式を規定しているが、現行の`/api/integrations/agencies`は`{ "success": false, "message": "..." }`という異なる形式を返している。sengoku-ai.com側がエラーコード(`INVALID_API_KEY`等)を見て分岐している場合、正しく解釈されない可能性がある。

### 2-5. 冪等性キー(6.2章)

ガイドはPOST系APIに`Idempotency-Key`ヘッダーを推奨しているが、`pushAgentToExternal()`・`testOutboundConnection()`のいずれも付与していない。

### 2-6. `include_sso=1`パラメータ(7.1章)

階層取得APIの`include_sso`パラメータ(SSO起動URLを含める)を現行の`syncHierarchyFromAgency()`は指定していない。SSO起動URL自体は`sso_launch.php?client=...`の形式が固定的に分かっているため実害は無いと考えられるが、ガイドの推奨仕様との差分として記録する。

---

## 3. 影響範囲

- **`users`テーブル**: `common_user_id`列(または対応する中間テーブル)の追加が必要。方針書の差分報告書(2-A章「共通ユーザーID」)と同一の影響範囲。
- **`src/lib/passport.ts`の`findOrCreateUserByLineId`/`resolveAgentIdByReferralCode`**: 新規登録フローに`POST /api/common-users/resolve`・`POST /api/referrals/capture`・`POST /api/referrals/confirm`の呼び出しを組み込む必要がある。ネットワーク呼び出しが増えるため、失敗時のフォールバック方針(登録自体は失敗させない等)の設計が必要。
- **`src/app/api/integrations/agencies/route.ts`**: `event`フィールドによる分岐処理への作り直しが必要(現状は暗黙的に「代理店upsertのみ」を前提にしている)。
- **`agency_integration_settings`テーブル・管理画面(`/admin/agency-integration`)**: 新しいイベント種別の処理状況や、`common_user_id`関連の紐付け状況を確認できるUIが必要になる可能性がある。
- **代理店ポータル(`/agency/*`)**: 現状「自分の紹介・売上集計のみ表示」という設計だが、ガイドの`agency_relations`(紹介関係)を反映する場合、表示内容の見直しが必要になる可能性がある。

---

## 4. 必要API(新規実装が必要なもの)

| ガイドのAPI | 方向 | 現状 |
|---|---|---|
| `POST /api/common-users/resolve` | 戦国パスポート → sengoku-ai.com(発信) | 未実装。新規登録フローへの組込みが必要 |
| `GET /api/common-users/{id}` または `?system_key=...&external_user_id=...` | 戦国パスポート → sengoku-ai.com(発信) | 未実装 |
| `POST /api/common-users/{id}/system-links` | 戦国パスポート → sengoku-ai.com(発信) | 未実装 |
| `POST /api/referrals/capture` | 戦国パスポート → sengoku-ai.com(発信) | 未実装。紹介URL流入時点(LIFFセッション確立時)に呼ぶ想定 |
| `POST /api/referrals/confirm` | 戦国パスポート → sengoku-ai.com(発信) | 未実装。登録確定時・購入確定時に呼ぶ想定 |
| `/api/integrations/agencies`のイベント種別分岐 | sengoku-ai.com → 戦国パスポート(受信、既存エンドポイントの拡張) | 部分実装。`event`フィールドでの分岐処理が必要 |

---

## 5. データ移行の要否

- **`common_user_id`の遡及発行**: 既存の全ユーザー(`users`テーブル)に対して`POST /api/common-users/resolve`相当の処理を一括実行し、sengoku-ai.com側に既存人物が見つかればそれと紐付け、見つからなければ新規発行する、というバッチ処理が必要になる可能性が高い。この際、方針書が定める「本人照合ルール」(氏名だけの一致では自動統合しない等)を踏まえたマッチングロジックの実装が必要。
- **既存の`agents.external_id`とsengoku-ai.com側`agent_code`の整合性確認**: 現行実装は既にこの対応を前提に運用されているため、大きな移行は不要と考えられるが、念のため双方のデータ突合をお勧めする。
- **紹介関係の遡及送信**: 過去の`users.referring_agent_id`を、今回新たに`referrals/confirm`相当のAPIでsengoku-ai.com側へ遡及送信するかどうかは、sengoku-ai.com側で既にこの情報を保持しているか(外部システムとして代理店紹介URLを経由した記録が別途あるか)によって要否が変わる。

---

## 6. 未回答のまま残る論点

- `POST /api/common-users/resolve`をどのタイミングで呼ぶか(LINEログイン成功直後の全ユーザーに対して常時呼ぶのか、代理店紹介ありのユーザーのみか)。全ユーザーに対して常時呼ぶ場合、LIFF起動のたびにsengoku-ai.comへの外部通信が発生することになり、レイテンシ・可用性への影響を検討する必要がある。
- `referrals/capture`をどのタイミングで呼ぶか。方針書は「紹介URL流入時」としているが、LIFF環境ではブラウザのURL遷移とアプリ内セッションの扱いが通常のWebと異なるため、既存の`sessionStorage`退避の仕組みとどう組み合わせるかの設計が必要。
- sengoku-ai.com側で、戦国パスポートに対応する`system_key`は`sengoku-passport`で確定か(方針書v3.0での「千ノ国パスポート」への改称と、この`system_key`表記の整合性)。

これらは指示書v1.0・collection-conquest指示書・方針書v2.1/v3.0と同様、個別指示書確定時に方針を明示いただければ、それに沿って実装計画を立てます。

---

*関連ドキュメント: `docs/sengoku-no-kuni-5-system-policy-diff-report.md`, `docs/external-purchase-current-state-audit.md`, `docs/collection-conquest-current-state-audit.md`*
