# ADR: 「はじまりの旅」学び・参加ミッション基盤

実装指示書［第2次修正版］§13 PR1 の成果物（ADR／設計書・DB設計・API境界・機能フラグ）。

- 状態: **提案（承認待ち）**
- 日付: 2026年8月20日
- 前提資料: `docs/PASSPORT_LEARNING_MISSION_CURRENT_STATE.md`

本書の決定はすべて現状調査書の事実に基づく。未確認事項に依存する決定には **[保留]** を付け、
運営承認・実接続確認が済むまで実装に入らない。

---

## ADR-1: 参加者向けルートは `/journey/...` にする

### 背景

指示書§4.1は `/passport/journey/...` を「想定ルート」とし、「既存ルーティング規約に合わせて最終決定する」としている。

### 事実

`src/app/(app)/` 直下は `/gacha`、`/academy`、`/castles` のようにトップレベルで、
**`/passport` という接頭辞は存在しない**。アプリ全体が「千ノ国パスポート」なので、
`/passport/` を付けると全ルートに付けるべき接頭辞を1機能だけに付けることになる。

### 決定

`src/app/(app)/journey/` 配下に置く。

| 指示書の想定 | 採用 |
|---|---|
| `/passport/journey` | `/journey` |
| `/passport/journey/missions` | `/journey/missions` |
| `/passport/journey/missions/:missionId` | `/journey/missions/[missionId]` |
| `/passport/journey/progress` | `/journey/progress` |
| `/passport/journey/interests` | `/journey/interests` |
| `/passport/journey/complete` | `/journey/complete` |

API名前空間・モジュール名・テーブル接頭辞は**指示書§4.3のとおり変更しない**
（`/api/journey/...`、`src/modules/learning-journey/`、`learning_journey_`）。
既存の `/api/missions`・`daily_mission_completions`・`src/lib/daily-missions.ts` と衝突しないことは確認済み。

---

## ADR-2: 入口は SideMenu とホーム上部に置き、BottomNav は変更しない

### 事実

BottomNav は5枠（パスポート / 武将登用 / 図鑑 / 地図 / 購入）がすべて埋まっている。
`/academy`・`/events`・`/market`・`/metaverse-tour` は BottomNav にも SideMenu にも無く、
ホームのクイックアクションとハブカードからのみ到達している。

### 決定

- BottomNav は変更しない（既存の主要導線を落とさない）
- SideMenu の「本日の任務」の直下に「はじまりの旅」を追加する
- ホームに専用の入口カードを1枚置く（`MetaverseTourEntryCard` と同じ形）
- 「はじまりの旅」を**上位入口**とし、そこから `/guide`・`/academy`・`/metaverse-tour` へ誘導する
  （指示書§4.1の第一候補）。既存画面の統合・移設は**行わない**

### 根拠

`/guide` は静的な遊び方説明（DBなし）、`/academy` は外部リンク集で、
どちらも教材・設問・進捗・回答の概念を持たない。機能的な重複が無いため、
統合せず誘導するだけで役割分担が成立する。

---

## ADR-3: 教材・設問・選択肢は「1つのバージョン」として束ねる

### 背景

指示書§7.1は2案を示している。(a) `learning_journey_questions` / `_choices` を
`learning_journey_content_versions` に従属させる、(b) 分離して
`learning_journey_answers` に回答時点のスナップショットを保存する。

### 決定

**(a) を採用する。** 設問と選択肢は `content_version_id` に従属させ、
公開済みバージョンは上書きせず新バージョンとして追加する（追記のみ）。

### 根拠

- 受入条件「教材・設問・選択肢の変更後も、過去の回答が回答時点の内容を参照できる」を、
  **参照の付け替えではなく参照先の不変性**で満たせる。スナップショット方式は
  「保存し忘れた列」が後から効いてくる事故が起きやすい
- 回答行が肥大化しない
- 既存コードベースの慣習（`castle_lord_plan_settings`・`commission_rule_sets` の
  「公開済みルールは書き換えず新版を作る」）と一致する

### 代償

教材の誤字修正でも新バージョンを作る必要がある。管理画面に
「下書きバージョンを作って差し替える」操作を用意して吸収する。

---

## ADR-4: スコープ識別は `project_key` に寄せ、`tenant_id` を新設しない [保留]

### 背景

指示書§7.1は「新しい `tenant_id` を無条件に追加せず、既存の `project_key`・国ID等との関係を整理せよ」としている。

### 事実

- `agency_integration_settings.default_project_key` という列が既に存在する（PR #160 で追加）
- **ただし値が未設定**。「戦国パスポートが千ノ国の中で独立したプロジェクトか」が未決定のため、
  外部への送信ペイロードからも当該フィールドを省いている
- 国（`provinces`）は**ゲーム内の国**であり、指示書の言う「将来のほかの国」（＝別プロジェクト）とは別概念

### 決定（暫定）

- `learning_journey_courses` と `learning_journey_enrollments` に
  `project_key text`（NULL許容）を持たせ、スコープを直接識別できるようにする
- `learning_journey_interest_profiles` と `learning_journey_consultation_preferences` も同様
  （コース外で検索・集計するため）
- ミッション・教材・設問・選択肢は**親から解決する**（冗長保持しない）
- **`tenant_id` は作らない**

### [保留] 運営判断が必要

`project_key` に入れる値が決まっていない。決まるまでは全行 `NULL`（＝「戦国パスポート単体」）で運用し、
値が決まった時点で既存行を一括更新できるようにする。この判断は §19.1 に**追加すべき項目**。

---

## ADR-5: OVE付与は「送信アダプタ差し替え式」にし、初期実証は付与OFFで進める

### 事実（現状調査 §10・§12）

- **このリポジトリに OVE の台帳は存在しない**
- `OveWalletCard.tsx` は明示的なモックで、`users.contribution_points` を1:1で
  「OVE移行予定ポイント（準備中）」として表示しているだけ
- コード内に「呼び出し元やDBには『OVE』という語を焼き込まない」という設計判断が明記されている
- **OVEW Wallet の正式APIは確認済み**（2026-08-20、リポジトリ public 化により調査）。
  `POST /api/v1/rewards/grant` / `/transactions/debit` / `/transactions/{id}/reverse` /
  `GET /api/v1/service/accounts/{externalUserId}/balance`。HMAC-SHA256署名認証
- ただし **`service_integrations` の `SENGOKU_PASSPORT` 行（APIキー・署名鍵・上限額）は
  運用担当者の手動発行が必要**で、発行済みかどうかは未確認
- ウォレットの動作確認用デプロイは **`AUTH_MODE=mock`** で起動しており、
  **戦国パスポートSSOはモック実装**（相手方のAPI仕様が未確定のため）

### 決定

1. 完了イベントと付与要求の構造は**送信先に依らず共通**にする
2. 送信先は `RewardDispatcher` インターフェース1本で抽象化し、実装を差し替える

   | 実装 | 用途 |
   |---|---|
   | `NoopRewardDispatcher` | `MISSION_REWARDS_ENABLED` OFF。要求を `PENDING` のまま置く |
   | `WalletRewardDispatcher` | `POST /api/v1/rewards/grant`（HMAC署名）。**API仕様は確定したが、`SENGOKU_PASSPORT` のAPIキー発行待ちのため [保留]** |
   | `ProvisionalRewardDispatcher` | 運営承認済みの暫定付与先。**[保留]** 承認前は未実装 |

3. **初期実証は指示書§8.1の選択肢2（`MISSION_REWARDS_ENABLED` OFF）を既定とする。**
   これが外部依存なしに進められる唯一の選択肢
4. 暫定付与先として国家貢献ポイントを採用する場合も、
   **`users.contribution_points` を直接加算しない**。
   必ず `learning_journey_reward_requests` を経由し、`recordContribution()` と同じ
   `adjust_user_balance()` 経由で加算し、付与理由・冪等キー・取消履歴を残す

### 注意（利用者から見た混乱）

`OveWalletCard` は `contribution_points` を「OVE移行予定ポイント」として1:1表示している。
暫定付与先に国家貢献ポイントを選ぶと、**利用者からは「OVEが付いた」ように見える**。
この表示の扱いは §19.1(6)(7) の運営判断に含めるべき。

---

## ADR-6: `external_user_id` には `users.id` を送る [保留]

### 事実（現状調査 §12）

Wallet の `POST /api/v1/rewards/grant` は **`common_user_id` を受け付けない**。
`RewardGrantRequestSchema` にそのフィールドは無く、`service_code` + `external_user_id` の組で
アカウントを解決する（未登録なら自動作成）。

`OveAccount.common_user_id` という列はウォレット側に存在するが、これはウォレットが
sengoku-ai.com の `POST /api/common-users/resolve` を**呼び出す側**として自分で解決・保存する
ためのもので、外部サービスからの付与時の識別子ではない。

これは指示書§2(3)「ユーザーの基準識別子には共通ID基盤の `common_user_id` を使用する」と
噛み合わない。パスポート側の内部識別子と、ウォレットへ送る識別子を**分けて考える必要がある**。

### 決定（案）

| 用途 | 識別子 |
|---|---|
| パスポート内部（進捗・回答・完了イベント） | `users.id`（uuid） |
| ウォレットへ送る `external_user_id` | **`users.id`** |
| 付与要求に併記して記録する | `common_user_id`（解決済みの場合） |

`users.id` を推す理由:

- 不変で、必ず存在する（`common_user_id` は解決に失敗しうる）
- `uq_users_common_user_id` により1つの共通IDに対しパスポートユーザーは1人なので、
  後から共通IDへ寄せ直す必要が生じても対応関係が一意に決まる
- ウォレット側は `external_user_id` を255文字までの任意文字列として扱うため制約に合う

### [保留] 運営・ウォレット側との合意が必要

**一度送った `external_user_id` は後から変更できない**（ウォレット側でアカウントが自動作成され、
以後その値で解決されるため）。実証を始める前に確定させること。§19.1 に**追加すべき項目**。

なお指示書§9「共通IDを取得できない場合は付与を行わず進捗を安全に保留する」は、
`external_user_id` に `users.id` を使う場合でも**方針として維持する**
（共通IDが解決できていないユーザーは、他システムとの突合ができないため）。

---

## ADR-7: 既存付与の重複防止は「照会」ではなく「取込」で行う [保留]

### 事実（現状調査 §12・§12-b）

指示書§8.4は重複防止判定の手段を2つ挙げているが、**(1) は現状実現できない**。

- **外部サービス向けの取引履歴照会APIが存在しない。** 外部から呼べるのは
  `GET /api/v1/service/accounts/{externalUserId}/balance` で、返るのは残高と
  `lifetime_credited` / `lifetime_debited` といった**集計値のみ**。
  `reasonType` / `reasonId` での検索はできない
- 取引履歴 `GET /api/v1/me/transactions` は**OVE独自セッション認証の本人向けAPI**で、
  外部サービスからは呼べない（横断照会できない設計）

さらに、そもそも**旧3,000 OVE はまだ1件も確定付与されていない**可能性が高い。
ウォレットは新規登録時に `wallet_referral_benefits` を `PENDING`（3,000 OVE）で作るが、
確定付与するコード自体が未実装で「常に `PENDING` のまま保留される」と明記されている。

### 決定

- **指示書§8.4(2) を採る。** 運営が提供する正式な付与済みデータを、
  出所・取込日時・更新履歴付きで判定テーブルへ取り込む
- 取込データが無い場合は**付与を保留**する（推測で付与済み判定を作らない）
- 判定テーブルは `learning_journey_` 接頭辞ではなく、機能横断で使えるよう別名にする
  （「はじまりの旅」以外の付与でも同じ判定が要るため）。命名は取込データの形が決まってから

### [保留] 先に確定が必要

1. `wallet_referral_benefits` が本当に全件 `PENDING` なのか（ウォレット管理画面 `/wallet-referrals` で確認）
2. `PENDING` のままなら、**そもそも「既存参加者は3,000 OVE受領済み」という前提が崩れる**。
   指示書§9.2「既存参加者の付与済みOVEを維持する」「新規向け3,000 OVE相当の重複取得を防止する」の
   対象者が誰なのかを§19.1(5)で定義し直す必要がある
3. ウォレット側に外部サービス向けの取引履歴照会APIを追加してもらう選択肢もある。
   その場合は§8.4(1) に戻れる

---

## ADR-8: 冪等キーは「完了イベントID」を基底にする

### 決定

```
mission_completion:{completionEventId}
```

`learning_journey_reward_requests.idempotency_key` に **UNIQUE制約**を張る。

**Wallet側の実装と整合することを確認済み**（現状調査§12）:

- `idempotency_key` は **HTTPヘッダーではなくリクエストボディのフィールド**（ウォレット独自規約）。
  代理店システムの `Idempotency-Key` ヘッダー方式とは別物なので混同しないこと
- 同一キーの再送は新規取引を作らず**既存取引をそのまま返す**（エラーにならない）。
  タイムアウト時に安全に再送できる
- 長さ上限 **255文字**。UUID1個なら余裕がある

代替形式（指示書§8.2）を使う場合も `{courseId}:{missionId}:{externalUserId}:{enrollmentId}` とし、
**必ず `enrollmentId` を含める**（再登録で同一ミッションを再提供したときにキーが衝突しないため）。

### `integration_outbox_events` との関係

現状調査のとおり `integration_outbox_events` には
`notification_outbox_events` のような一意制約が**無い**。
したがって重複防止は **`learning_journey_reward_requests` 側の UNIQUE で担保**し、
outboxは「送ると決まった要求の配送手段」としてのみ使う。

`LIMIT_HELD` と共通ID未解決の要求は**outboxへ投入しない**（指示書§8.5）。

### [設定なし] 既知の制約

Vercel の `CRON_SECRET` が未設定のため、**outboxの自動再送は現在動作していない**（手動drainのみ）。
本機能以前からの既存課題だが、OVE付与をoutboxに載せる前に解消が必要。

---

## ADR-9: 機能フラグは環境変数ではなく設定テーブルにする

### 事実

このリポジトリに汎用の機能フラグ基盤は無い。設定は**ドメインごとの設定テーブル + 管理画面**という
一貫した方式になっている: `line_settings` / `payment_settings` / `agency_integration_settings` /
`castle_lord_plan_settings` / `metaverse_tour_settings` / `ai_image_settings` / `sen_no_kuni_hub_settings`。

環境変数は7個だけで、いずれも**秘密情報か上限値**（`SESSION_SECRET`、`SUPABASE_SERVICE_ROLE_KEY`、
`ADMIN_PASSWORD`、`ADMIN_PASSWORD_OPERATOR`、`CRON_SECRET`、各種 `*_MAX_BYTES`）。
機能のON/OFFに使われている環境変数は**1つも無い**。

### 決定

指示書§17の4フラグを、単一行の設定テーブル `learning_journey_settings` の boolean 列として持つ。
**環境変数は新規作成しない**（指示書§17「環境変数名を重複作成しない」）。

| 指示書のフラグ名 | 列 | 初期値 | 意味 |
|---|---|---|---|
| `LEARNING_MISSIONS_ENABLED` | `missions_enabled` | `false` | 機能全体。OFFで入口ごと非表示 |
| `MISSION_REWARDS_ENABLED` | `rewards_enabled` | `false` | 新規のOVE付与要求の送信 |
| `MISSION_CONSULTATION_SYNC_ENABLED` | `consultation_sync_enabled` | `false` | 相談希望の代理店連携 |
| `MISSION_LINE_NOTIFICATIONS_ENABLED` | `line_notifications_enabled` | `false` | LINE通知 |

- **全フラグの初期値は `false`**。マイグレーションを適用しただけでは何も起きない
- 変更は manager ロール限定 + 監査ログ必須
- 緊急停止（§17.1）は `missions_enabled` / `rewards_enabled` をOFFにする操作として実現し、
  **進捗・回答・完了イベント・付与台帳は削除しない**（§17.2）

---

## ADR-10: 監査ログは `admin_audit_logs` に3列追加して再利用する

### 事実

既存の列は `actor_name` / `action` / `details` / `target_type` / `target_id` /
`before_snapshot` / `after_snapshot` / `created_at`。
書込は `logAdminAction()` に一本化され、呼び出しは106箇所。

指示書§7が要求する6項目のうち、**管理者ロール・リクエストID・操作理由の3つが無い**。

### 決定

`admin_audit_logs` に NULL許容列を3つ追加する。**新規監査テーブルは作らない**。

```sql
alter table admin_audit_logs add column admin_role text;        -- 'operator' | 'manager'
alter table admin_audit_logs add column request_id text;
alter table admin_audit_logs add column operation_reason text;
```

`logAdminAction()` のシグネチャは第4引数のオプショナル拡張で吸収し、
**既存106箇所は無変更**（後方互換）。

管理者認証が共有パスワード方式であることが監査ログから分かるよう、
`admin_role` と併せて「自己申告の実行者名である」旨を記録する（指示書§11）。

`/admin/audit-logs` は現在 `actor_name` / `action` / `details` / `created_at` しか
表示していないため、追加列と既存の `target_*` を表示に含める。

---

## DB設計

すべて `learning_journey_` 接頭辞。既存テーブルへの変更は ADR-10 の3列のみ。

### テーブル一覧

| テーブル | 役割 | スコープ列 |
|---|---|---|
| `learning_journey_settings` | 機能フラグ・滞留判定時間・付与上限（単一行） | — |
| `learning_journey_courses` | コース | `project_key` |
| `learning_journey_missions` | ミッション（コースに従属、並び順） | 親から解決 |
| `learning_journey_content_versions` | 教材バージョン（追記のみ） | 親から解決 |
| `learning_journey_questions` | 設問（`content_version_id` に従属） | 親から解決 |
| `learning_journey_choices` | 選択肢（`question_id` に従属） | 親から解決 |
| `learning_journey_enrollments` | ユーザーのコース登録 | `project_key` |
| `learning_journey_progress` | ミッション進捗 | 親から解決 |
| `learning_journey_answers` | 回答 | 親から解決 |
| `learning_journey_completion_events` | 完了イベント | 親から解決 |
| `learning_journey_reward_requests` | OVE付与要求 | 親から解決 |
| `learning_journey_interest_profiles` | 興味プロフィール | `project_key` |
| `learning_journey_consultation_preferences` | 相談・案内希望（履歴保持） | `project_key` |

### 主要な制約（指示書§7.2）

| 目的 | 制約 |
|---|---|
| 重複登録の防止 | `learning_journey_enrollments` に `unique (course_id, user_id, enrollment_seq)`。再登録は `enrollment_seq` で識別 |
| 重複完了の防止 | `learning_journey_completion_events` に `unique (enrollment_id, mission_id)` |
| 二重付与の防止 | `learning_journey_reward_requests` に `unique (idempotency_key)` と `unique (completion_event_id)` |
| 付与額の範囲 | `check (amount >= 0 and amount <= <上限>)` |
| 回答の再現性 | `learning_journey_answers` は `content_version_id` / `question_id` / `choice_id` を保持。公開済みバージョンは更新しない |
| 相談希望の履歴 | `learning_journey_consultation_preferences` は追記のみ。`consented_at` を必須列にする |
| 物理削除の禁止 | 履歴系は `deleted_at` によるソフト削除のみ |

すべての新規テーブルに `alter table ... enable row level security;` を付ける（既存慣習）。

### 付与状態（指示書§8.3）

```
PENDING → PROCESSING → SUCCEEDED
                    ↘ FAILED（再実行可）
PENDING → LIMIT_HELD（上限保留。通常リトライ対象外）
PENDING → CANCELLED（Wallet未送信を管理者が無効化）
SUCCEEDED → REVERSED（Wallet側で正式取消。取消取引IDを保存）
```

`CANCELLED` と `REVERSED` は**自動遷移させない**。管理者操作 + 監査ログを必須とする。
`PENDING` / `PROCESSING` が `learning_journey_settings` の滞留判定時間を超えたら
要対応一覧へ出す（**自動で `FAILED` に落とさない**）。利用者には「OVE付与手続き中」と表示する。

---

## API境界

すべて `/api/journey/` 配下。参加者向けは `getSession()`、管理者向けは
`getAdminSession()`（財務影響操作は `requireManagerRole()`）で保護する。

### 参加者向け

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/journey/course` | 公開中コースと自分の進捗サマリ |
| POST | `/api/journey/enroll` | コース登録 |
| GET | `/api/journey/missions` | ミッション一覧（進捗つき） |
| GET | `/api/journey/missions/[missionId]` | 教材本文と設問。**正解は返さない** |
| POST | `/api/journey/missions/[missionId]/answers` | 回答送信。サーバー側で採点・完了判定 |
| GET | `/api/journey/progress` | 完了状況、獲得予定・付与済み |
| PUT | `/api/journey/interests` | 興味カテゴリの登録 |
| PUT | `/api/journey/consultation` | 相談希望 / 案内不要 の登録（同意日時つき） |

### 管理者向け

| メソッド | パス | 権限 |
|---|---|---|
| GET/POST/PATCH | `/api/admin/journey/courses[/id]` | admin |
| GET/POST/PATCH | `/api/admin/journey/missions[/id]` | admin |
| POST | `/api/admin/journey/content-versions` | admin |
| GET | `/api/admin/journey/enrollments` | admin |
| GET | `/api/admin/journey/reward-requests` | admin |
| POST | `/api/admin/journey/reward-requests/[id]/retry` | **manager** |
| POST | `/api/admin/journey/reward-requests/[id]/cancel` | **manager** |
| POST | `/api/admin/journey/reward-requests/[id]/reverse` | **manager**（Wallet取消取引IDが必須） |
| PATCH | `/api/admin/journey/settings` | **manager**（フラグ・上限・滞留判定時間） |
| GET | `/api/admin/journey/interests` | admin |
| GET | `/api/admin/journey/consultations` | admin |

### 守るべき境界（指示書§11）

- クイズの正解を回答前のフロントへ送らない（`/missions/[missionId]` のレスポンスに正解を含めない）
- すべての完了判定をサーバー側で行う
- 外部API呼び出しはサーバー間通信のみ。APIキーをフロントへ露出しない
- 付与系APIにレート制限を設ける
- 同意撤回・案内停止を即時反映する

### モジュール構成

```
src/modules/learning-journey/
  domain/          コース・ミッション・完了条件・採点・付与額の純粋関数
  application/     開始・回答・完了・付与要求・興味登録のユースケース（ports.ts 経由）
  infrastructure/  Supabaseリポジトリ、RewardDispatcher実装、代理店・共通IDゲートウェイ
  presentation/    APIルートから呼ぶ薄いハンドラ
```

**アーキテクチャCIの制約**（現状調査 §17）を満たすこと:

- `domain/` は Next.js / Supabase SDK / Stripe / `@/lib/supabase-server` を import しない
- `application/` は上記に加え `.from(` / `.rpc(` / `createSupabaseServerClient(` / `fetch(` を
  **ソース文字列としても**含めない。Repositoryインターフェース経由のみ
- 判定対象は親ディレクトリ名が literal に `domain` / `application` のファイル

---

## 段階的なPRの割り当て（指示書§13）

| PR | 内容 | 前提 |
|---|---|---|
| **PR1（本PR）** | 現状調査書・本ADR。**コード変更・マイグレーションなし** | — |
| PR2 | ミッション基盤（テーブル・ドメイン・採点・完了判定・単体テスト）+ `learning_journey_settings`（全フラグOFF）+ ADR-10の監査ログ3列 | 本ADRの承認 |
| PR3 | 参加者画面 | PR2 |
| PR4 | 管理画面・監査ログ表示 | PR2 |
| PR5 | Wallet・共通ID連携、付与上限、LIMIT_HELD、outbox連携 | **§19.0の法務確認 + §8.1の方針承認 + Wallet仕様の確定** |
| PR6 | 興味・相談・LINE連携 | PR3・PR4 |

各PRで `npm run ci` を実行し、**`test:architecture` を省略しない**。

---

## この設計で未解決のまま残ること

| # | 項目 | 誰が決めるか |
|---|---|---|
| 1 | OVEの法的位置付け（§19.0） | 専門家 |
| 2 | `service_integrations` の `SENGOKU_PASSPORT` 行（APIキー・署名鍵・上限額）の発行 | ウォレット運用担当者（手動作業） |
| 2-b | 「はじまりの旅」用の `transaction_type` と `reward_rules` を新設するか、既存の汎用種別を使うか | 運営 / ウォレット側 |
| 3 | 旧3,000 OVE が全件 `PENDING` のままか。`PENDING` なら§9.2の対象者定義をやり直す | 運営（ウォレット管理画面で確認） |
| 3-b | `external_user_id` に何を送るか（ADR-6。一度送ると変更不可） | 運営 / ウォレット側 |
| 4 | 7本それぞれの付与数・付与総量上限 | 運営 |
| 5 | 「本日の任務」との二重特典の扱い | 運営 |
| 6 | `project_key` に入れる値 | 運営 |
| 7 | `OveWalletCard` の表示を暫定付与時にどう扱うか | 運営（**§19.1への追加提案**） |
| 8 | `CRON_SECRET` 未設定によるoutbox自動再送の停止 | 運営（Vercel設定） |
| 9 | 管理者の個人アカウント化・再認証・MFA（§19.1(16)） | 運営 |

**1〜4が未決のままPR5には入らない。** PR2〜PR4は付与を伴わないため、本ADRの承認だけで進められる。
