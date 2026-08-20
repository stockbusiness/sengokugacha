# 「はじまりの旅」現状調査書

実装指示書［第2次修正版］§3 に基づく着手前調査。

| 項目 | 値 |
|---|---|
| 対象リポジトリ | `stockbusiness/sengokugacha`（https://github.com/stockbusiness/sengokugacha） |
| 基準ブランチ | `main` |
| 調査時点の最新コミット | `b07ce04b047afebabfd1f3d74d8f5c685d10a719` |
| 指示書の記載コミット | `b07ce04b047afebabfd1f3d74d8f5c685d10a719`（**一致。差分なし**） |
| 調査日 | 2026年8月20日 |

> 未マージのPR #162（区画の相談ボタン・城の解放進捗と通知・内覧との接続）が存在する。
> 本機能とは領域が重ならないが、`castle_plots` / `metaverse_inquiries` に列を追加し
> `castle_unlock_notifications` を新設するため、マージ後は migration 番号が
> `20260814000001` まで進む。

## 凡例（§3.2 の3分類）

| 記号 | 意味 |
|---|---|
| **[確認]** | ソースコード上で確認できた事実 |
| **[設定なし]** | 環境変数・外部設定がないため確認できない事項 |
| **[要接続]** | 実環境での接続テストが必要な事項 |

推測で既存API・DB列・環境変数名を作っていない。確認できなかったものは確認できなかったと書いている。

---

## §1.2 着手前に記録する情報

| 項目 | 内容 | 区分 |
|---|---|---|
| 対象リポジトリURL | https://github.com/stockbusiness/sengokugacha | [確認] |
| 基準ブランチ / 最新SHA | `main` / `b07ce04b047afebabfd1f3d74d8f5c685d10a719` | [確認] |
| フレームワーク | Next.js **16.2.10**（App Router, Turbopack）/ React **19.2.4** | [確認] |
| 言語 | TypeScript 5 系 | [確認] |
| パッケージマネージャー | npm（`package-lock.json` のみ。pnpm/yarn のロックファイルは無い） | [確認] |
| 認証方式 | LINEログイン → 自前のJWTセッションCookie（詳細は 2.・3.） | [確認] |
| ユーザーID体系 | `users.id`（uuid）が主。`line_user_id` は外部キー的な参照値 | [確認] |
| DBとORM | Supabase（PostgreSQL）。**ORMなし**、`@supabase/supabase-js` を直接使用 | [確認] |
| LINE／LIFF | `@line/liff` 2.29.2 を動的importで使用。IDトークン検証はサーバー側 | [確認] |
| 管理画面 | `src/app/admin/(dashboard)/` 配下。共有パスワード方式 | [確認] |
| staging環境 | Supabase staging が存在し、migrationは手動適用運用。**このサンドボックスからは到達不可** | [要接続] |
| CI | GitHub Actions `.github/workflows/ci.yml` の1本のみ。8ジョブ | [確認] |

---

## §3.1 調査項目

### 1. 技術構成 — [確認]

- Next.js 16.2.10（App Router）、React 19.2.4、TypeScript 5、Tailwind CSS 4
- テスト: **vitest 4.1.10**（Jestではない）
- 主要依存: `@supabase/supabase-js` 2.110.0、`@line/liff` 2.29.2、`stripe` 22.3.0、`jose` 6.2.3、`@sentry/nextjs` 10.64.0、`@vercel/blob` 2.6.1、`qrcode`、`sharp`、`gsap`
- ルート構成
  - `src/app/(app)/` … LIFF内の参加者向け画面（`layout.tsx` が `SideMenu` / `BottomNav` / `LegalFooter` を差し込む）
  - `src/app/admin/(dashboard)/` … 管理画面
  - `src/app/agency/` … 代理店ポータル
  - `src/app/api/` … APIルート
  - `src/lib/` … データアクセス層（Supabase呼び出しはここに集中）
  - `src/modules/<domain>/{domain,application,infrastructure}/` … モジュール層
- **`AGENTS.md` の規約**: 「This is NOT the Next.js you know」。実装前に `node_modules/next/dist/docs/` の該当ガイドを読むことが必須。

### 2. 認証方式 — [確認]

参加者・管理者・代理店の3系統がそれぞれ独立したCookieを持つ。

| 系統 | Cookie | 有効期間 | 実装 |
|---|---|---|---|
| 参加者 | `sengoku_session` | 30日 | `src/lib/session.ts` |
| 管理者 | `sengoku_admin_session` | 12時間 | `src/lib/admin-session.ts` |
| 代理店 | （`src/lib/agent-session.ts`） | — | `src/lib/agent-session.ts` |

いずれも `src/shared/auth.ts` の `signSessionJwt` / `verifySessionJwt`（`jose`、`SESSION_SECRET`）で署名する自前JWT。`httpOnly` / `sameSite=lax` / 本番のみ `secure`。

**参加者セッションのペイロードは `{ userId }` のみ**。`common_user_id` はセッションに入っていないため、ミッションAPIは毎回 `users` から引く必要がある。

### 3. LINE／LIFFログインとセッション管理 — [確認]

- クライアント共通の初期化処理は `src/lib/client/ensure-liff-session.ts`。各画面の先頭で `ensureLiffSession()` を呼ぶ。
- 流れ: `/api/app-config` で LIFF ID 取得 → `liff.init()` → `POST /api/auth/session`（既存Cookieが有効ならここで終了）→ 無効なら `liff.login()` → 戻ってきたら `liff.getIDToken()` → `POST /api/auth/line`
- **IDトークンの検証はサーバー側**（`src/lib/line.ts` の `verifyLineIdToken`、LINEの `verify` エンドポイントへ問い合わせ）。SDKのバージョンに依存しない。
- LIFF SDK は `await import("@line/liff")` の**動的import**。SSRで読み込まれない。
- 代理店紹介コード `?ref=` は `sessionStorage`（キーは `sengoku_ref_code`）へ退避され、LINEログインのリダイレクトを跨いで復元される。
- `POST /api/auth/line` は ①IDトークン検証 ②`findOrCreateUserByLineId` ③`recordLoginToday` ④セッションCookie発行 ⑤`syncCommonUserHub`（**ベストエフォート**、失敗してもログインは成功）の順。

**「はじまりの旅」への含意**: LIFF外ブラウザでの再開（§14.5）は、`sengoku_session` Cookie が生きていれば動く。切れている場合は `liff.login()` が必要なので、LINE外ブラウザでは再ログインできない可能性がある。**[要接続]** 実機確認が必要。

### 4. 現在使用しているユーザーID — [確認]

`users` テーブル（`20260707000001_initial_schema.sql`）:

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  display_name text,
  rank text not null default '足軽' check (rank in (...)),
  kokudaka int not null default 0,
  senko int not null default 0,
  gacha_tickets int not null default 0,
  referring_agent_id uuid references agents(id),
  created_at timestamptz not null default now()
);
```

後続マイグレーションで `contribution_points`、`common_user_id`、`common_user_synced_at`、`referral_session_key`、`referral_token` が追加されている。

- アプリ内の基準識別子は **`users.id`（uuid）**。セッションもこれを持つ。
- `line_user_id` はLINE側のsubで、**全システム共通IDとしては使っていない**（指示書§5の禁止事項と整合）。

### 5. common_user_id の保持・解決状況 — [確認] / [設定なし]

- `users.common_user_id text`、`users.common_user_synced_at timestamptz`（`20260802000001_common_user_hub.sql`）
- 部分一意インデックス `uq_users_common_user_id`（NULL以外で一意）により、1つの共通IDに紐づくパスポートユーザーは1人まで
- 解決処理は `src/lib/common-user-hub.ts` の `resolveCommonUserId()`。ログイン時に `syncCommonUserHub()` から**ベストエフォート**で呼ばれる
- 通信先の認証は `sen_no_kuni_hub_settings`（`system_key` / `key_id` / `hmac_secret` / `enabled`）に保存。リプレイ防止は `sen_no_kuni_hub_used_nonces` の `unique (key_id, nonce)`
- 未解決のまま残ったユーザーの再解決基盤が既にある: `common_user_resolution_attempts` テーブル + `claim_common_user_resolution()` / `mark_common_user_resolution_succeeded()` / `mark_common_user_resolution_failed()`（claim_token + lease による原子的claim・fencing）。管理画面は `/admin/integration-recovery`

**[設定なし]** HUBの接続設定（`key_id` / `hmac_secret`）はDBに保存される運用のため、このサンドボックスからは値も疎通も確認できない。

**[要接続]** 実際に `common_user_id` を解決できるかは staging での疎通確認が必要。

**「はじまりの旅」への含意**: 指示書§9「共通IDを取得できない場合は付与を行わず進捗を安全に保留する」は、**既存の `common_user_resolution_attempts` と `/admin/integration-recovery` をそのまま再利用できる**。本機能専用の再解決基盤を新設する必要はない（§5の禁止事項とも一致）。

### 6. DBテーブルとマイグレーション方式 — [確認]

- マイグレーションは `supabase/migrations/*.sql`、**80ファイル**（PR #162 のマージで81になる）
- 命名規約: `YYYYMMDDHHNNNN_snake_case.sql`
- 新規テーブルには必ず `alter table <name> enable row level security;` を付ける。service roleキー経由のみアクセスする前提
- `20260809000001_grant_service_role_privileges.sql` で public スキーマへの明示的GRANTと `alter default privileges` を実施済み
- **適用は手動運用**: staging には SQL を手で流し、`supabase_migrations.schema_migrations`（`version` / `name` / `statements`）へ手動でINSERTして履歴を合わせている（`docs/PHASE_C1_MIGRATION_HISTORY_REPAIR_PLAN.md` / `..._RESULTS.md`）
- CIでは `supabase start` でローカルに全マイグレーション + `supabase/seed.sql`（25行）を適用して migration/integration/contract テストを走らせる
- **DBアクセスは単一ファクトリ経由**: `src/lib/supabase-server.ts` の `createSupabaseServerClient()`。直接 `createClient` を呼ぶ箇所は無い

### 7. 既存のパスポート画面・メニュー構成 — [確認]

`src/app/(app)/` 直下のルート（**`/passport` という接頭辞は存在しない**）:

```
academy  castle-lord  castles  collection  events  gacha  guide
map  market  metaverse-tour  my-land  purchase  ranking  regions  tenka-toitsu
```

**BottomNav**（`src/components/BottomNav.tsx`）— 5枠、すべて埋まっている:

| ラベル | パス |
|---|---|
| 🏯 パスポート | `/` |
| 🎴 武将登用 | `/gacha` |
| 📖 図鑑 | `/collection` |
| 🗾 地図 | `/map` |
| 🛒 購入 | `/purchase` |

**SideMenu**（`src/components/SideMenu.tsx`）:
お知らせ / 本日の任務（`/`）/ プレゼント（未実装、`href: null`）/ 国家ランキング / 全国お城プロジェクト / 所有区画 / 城主ダッシュボード / 遊び方・ヘルプ（`/guide`）/ お問い合わせ

**ホーム（`/`）の構成**: `PriorityQuickActions`（武将登用・AI寺子屋・イベント・武将図鑑・国盗り・マーケットの6タイル）→ `DailyMissionsCard` → 各ハブカード → `MetaverseTourEntryCard` → `CastleLordEntryCard` → `OveWalletCard`

**重要**: `/academy`、`/events`、`/market`、`/metaverse-tour` は **BottomNav にも SideMenu にも無い**。ホームのクイックアクションとハブカード、および `/gacha` の推奨タイルからのみ到達する。

**「はじまりの旅」への含意**:
- BottomNav は5枠が埋まっており、追加すると既存の主要導線を1つ落とすことになる。指示書§4.1「利用者の入口を増やさない」の観点では、**ホーム上部への配置か SideMenu への追加**が現実的。
- `/guide` は静的な5セクションの遊び方説明（95行、DBなし）、`/academy` は外部リンク集（`external_links` の `ai_art_school` 等へ誘導、学習データを持たない）。**どちらも教材・進捗・回答の概念を持たないので、「はじまりの旅」と機能的な重複は無い**。上位入口として両者へ誘導する方式（指示書§4.1の第一候補）が素直に実装できる。

### 8. 既存の「本日の任務」と国家貢献ポイント付与の関係 — [確認]

**実装場所**: `src/lib/daily-missions.ts` / `GET /api/missions` / `POST /api/missions/ping` / `daily_mission_completions` テーブル / `src/components/dashboard/DailyMissionsCard.tsx`

7つの固定任務がコード内の定数配列 `DAILY_MISSIONS` にハードコードされている（**DBのマスタではない**）:

| key | タイトル | 判定 | 付与ポイント |
|---|---|---|---|
| `gacha_draw` | 無料武将登用を行う | `gacha_logs` から自動 | 0 |
| `view_collection` | 図鑑を確認する | ping | 0 |
| `view_terakoya` | **AI寺子屋を見る** | ping | **30** |
| `view_market` | **市場を確認する** | ping | **5** |
| `view_events` | **イベント情報を見る** | ping | **20** |
| `view_announcements` | お知らせを読む | ping | 0 |
| `login_streak` | 連続ログインする | `login_logs` から自動 | 0 |

付与経路: `pingManualMission()` → `daily_mission_completions` へ `upsert(..., ignoreDuplicates: true)` → **新規insertだった場合のみ** `recordContribution()` → `user_activity` へ記録 + `adjust_user_balance()` で `users.contribution_points` を原子的に加算。日次で1回だけ付く。

**「はじまりの旅」への含意（指示書§4.1・§19.1(15)の二重特典）**:
「はじまりの旅」のミッション4「AIアート／ガチャ等の体験」は、既存の `view_terakoya`（30pt）や `gacha_draw` と**同じユーザー行動で発火しうる**。同じ1回のAI寺子屋閲覧で国家貢献ポイント30ptとミッションのOVEが両方付く状態になる。運営判断が必要（§19.1(15)）。

**命名衝突の確認**: 指示書§4.3が指定する `/api/journey/...` / `learning_journey_` / `src/modules/learning-journey/` は、いずれも既存の `/api/missions` / `daily_mission_completions` / `src/lib/daily-missions.ts` と衝突しない。**指示書の接頭辞方針をそのまま採用できる**。

### 9. 管理者権限、共有パスワード方式、管理画面 — [確認]

- 認証は**共有パスワード**。環境変数 `ADMIN_PASSWORD`（manager用）と `ADMIN_PASSWORD_OPERATOR`（operator用）の2本
- **2ロール制は既に存在する**: `AdminRole = "operator" | "manager"`。`requireManagerRole()` で manager 限定操作をサーバー側検証できる
- 実行者名（`actorName`）はログイン時の**任意入力の自己申告**。個人を認証する仕組みではない（コード内コメントに明記あり）
- 旧セッション（2ロール導入前のCookie）は `adminRole` クレームを持たないため manager 扱いにフォールバックする
- 管理画面のナビは `src/app/admin/(dashboard)/admin-sidebar.tsx` の7グループ:
  ゲーム設定 / LINE / 代理店・城主プラン / 決済・売上 / コンテンツ・導線 / ユーザー・ログ / 運用監視

**「はじまりの旅」への含意**: 指示書§11「付与上限変更・LIMIT_HELD解除・取消訂正・緊急停止を managerロール限定とし、サーバー側で権限を検証する」は、**`requireManagerRole()` をそのまま使える**。新しい権限基盤は不要。個人アカウント化・再認証・MFA（§11後段、§19.1(16)）は未実装で、運営判断待ち。

### 10. 既存のOVE表示・国家貢献ポイント付与処理 — [確認] ★重要

**このリポジトリに OVE の台帳は存在しない。**

`src/components/economy/OveWalletCard.tsx` は明示的なモック:

- 表示名 `OVE_LABEL = "OVE移行予定ポイント"`、単位 `pt`、見出しは「（準備中）」
- 中身は `users.contribution_points` を **1:1 で仮換算した表示専用の値**
- 注意書き `OVE_CAUTION` =「このポイントは現在、暗号資産ウォレットの残高ではありません。外部送金・換金はできません。将来のOVEへの移行条件・換算率は未確定です。」
- ファイル冒頭のコメントに設計判断が明記されている:
  **「名称・注意書きは今後変更される可能性があるため、この1箇所に集約している（呼び出し元やDBには「OVE」という語を焼き込まない）」**

`grep -rli "OVE"` の結果、OVEという語を含むソースは**この1ファイルのみ**。DBスキーマにも `ove` を含む列・テーブルは無い。

**国家貢献ポイントの付与経路**（唯一の入口は `recordContribution()`）:

| 経路 | 実装 | 備考 |
|---|---|---|
| 手動任務（AI寺子屋30 / 市場5 / イベント20） | `daily-missions.ts` → `recordContribution()` | 日次1回 |
| ログイン（2pt） | `passport.ts` → `recordContribution()` | |
| ガチャ | `execute_gacha_draw()`（DB関数） | **例外**。単一トランザクション化のため `recordContribution()` を経由せず、DB内で `user_activity` 挿入と残高加算を直接行う |

残高更新は必ず `adjust_user_balance()`（`20260803000001`）経由の原子的更新。read-modify-write は排除済み。

**「はじまりの旅」への含意**:
- 指示書§8.1「`users.contribution_points` を直接加算せず、本機能専用の付与要求・付与理由・冪等キー・取消履歴を経由する」「国家貢献ポイントとOVEが1対1であると推測しない」は、**既にコード側で下されている判断と完全に一致する**。
- 一方で「暫定付与先として国家貢献ポイントを使う」場合、`OveWalletCard` が `contribution_points` を1:1でOVEとして見せている以上、**利用者からは区別がつかない**。この表示をどう扱うかが運営判断事項になる（§19.1(6)(7)）。
- **§8.1の選択肢2（`MISSION_REWARDS_ENABLED` をOFFにして学習部分だけ検証）が、現時点で外部依存なしに進められる唯一の選択肢。**

### 11. 3,000 OVE 一括付与処理の実装場所 — [確認：本リポジトリには無い]

`src`・`docs`・`supabase/migrations` を横断検索したが、**3,000 OVE の一括付与処理はこのリポジトリに存在しない**（`3000` / `3,000` と OVE を結びつける記述なし）。

指示書§3.1(11) の留保「本リポジトリ内に存在しない可能性がある」は**正しかった**。

**正本は OVEW Wallet 側にあった。** 詳細は下の「12-b」を参照。要点だけ先に書くと、
ウォレットは新規登録時に `wallet_referral_benefits` を `PENDING`（3,000 OVE）で作るが、
**確定付与するコード自体がまだ無く、全件 `PENDING` のまま保留されている**。

### 12. 別リポジトリ `stockbusiness/ovewwallet` — [確認] / [要接続]

2026年8月20日にリポジトリが public 化されたため調査した（調査時点のHEAD: `5a702c2`）。
以下はすべて `ovewwallet` のソース・ドキュメントから読み取った事実で、推測は含まない。

#### 構成

pnpm モノレポ。`apps/api`（NestJS 10 / REST / Swagger `/api/docs`）、
`apps/user-wallet`・`apps/admin-wallet`（Next.js 14）、`packages/{database,ledger,auth,shared-types,config}`。
DBは PostgreSQL + Prisma。デプロイは Railway（API）+ Vercel（画面）。

台帳は**取引の直接UPDATE/DELETEを行わない設計**（訂正は必ずREVERSALで記録）。

#### 正式API（外部サービス向け）

| メソッド / パス | 用途 |
|---|---|
| `POST /api/v1/rewards/grant` | ポイント付与 |
| `POST /api/v1/transactions/debit` | ポイント利用（減算） |
| `POST /api/v1/transactions/{transactionId}/reverse` | 取消 |
| `GET /api/v1/service/accounts/{externalUserId}/balance` | 残高照会 |

`service_code` は `ServiceCode` enum の値。**千ノ国パスポートは `SENGOKU_PASSPORT`** が定義済み。

#### 認証（HMAC署名）

```
X-OVE-Api-Key: ovk_...
X-OVE-Timestamp: <UNIXエポックミリ秒>
X-OVE-Nonce: <リクエストごとのランダム文字列>
X-OVE-Signature: HMAC-SHA256(signing_secret, "<timestamp>.<nonce>.<method>:<path>:<raw body>")
```

- タイムスタンプ許容ずれ **±5分**
- nonce は連携先ごとに一度きり（リプレイ拒否）
- 署名対象は Node.js の `JSON.stringify(body)` と**完全一致**が必要（キー順序・非ASCIIのエスケープ）
- APIキー・署名鍵の発行は**運用担当者の手動作業のみ**。セルフサービス機能は無い。発行時に一度だけ平文で渡され、再表示不可

#### 付与リクエストの項目（`RewardGrantRequestSchema`）

```json
{
  "service_code": "SENGOKU_PASSPORT",
  "external_user_id": "<連携先システム側のユーザーID>",
  "event_type": "...",
  "event_id": "...",
  "amount": 10000,
  "transaction_type": "EVENT_REWARD",
  "display_name": "...",
  "description": "...",
  "idempotency_key": "..."
}
```

`amount` は正の整数。`external_user_id` が未登録なら**アカウント・ウォレット・連携を自動作成**する。

#### 冪等性 — ★指示書§8.2との差分

**`idempotency_key` はHTTPヘッダーではなくリクエストボディのフィールド。**
ウォレット独自の規約で、代理店システム側の `Idempotency-Key` ヘッダー方式とは異なる。
同一キーの再送は新規取引を作らず**既存取引をそのまま返す**（grant/debit/reverse共通、エラーにならない）。

#### `common_user_id` — ★指示書§2(3)との重大な差分

**付与APIは `common_user_id` を受け付けない。** `RewardGrantRequestSchema` に
そのフィールドは存在せず、`service_code` + `external_user_id` の組でアカウントを解決する。

`OveAccount.common_user_id` という列はスキーマ上存在する（migration `20260720115600`）が、
これはウォレットが sengoku-ai.com の `POST /api/common-users/resolve` を**呼び出す側**として
自分で解決・保存するためのもので、外部サービスからの付与時の識別子ではない。

→ **パスポート側は `external_user_id` として何を送るかを決める必要がある**
（`users.id` か `common_user_id` か）。これは§19.1に**追加すべき運営判断事項**。

#### 取引履歴照会 — ★指示書§8.4の前提が崩れる

**外部サービス向けの取引履歴照会APIは存在しない。**
外部サービスが呼べるのは `GET /api/v1/service/accounts/{externalUserId}/balance`（**残高のみ**）で、
返るのは `available_balance` / `pending_balance` / `held_balance` /
`lifetime_credited` / `lifetime_debited` といった集計値。

取引履歴（`GET /api/v1/me/transactions`）は**OVE独自セッション認証の本人向けAPI**で、
外部サービスからは呼べない。他サービス利用者の残高を横断照会できない設計になっている
（旧 `GET /api/v1/wallets/{oveAccountId}/...` は廃止済み）。

→ **指示書§8.4(1)「Walletの取引履歴照会APIを reasonType・reasonId 等で検索する」は現状実現できない。**
§8.4(2)（運営が提供する正式な付与済みデータの取込）を採るか、ウォレット側にAPI追加を依頼するかになる。

#### 付与ルール（`reward_rules`）による上限

`transaction_type` が `RULE_CODE_BY_TRANSACTION_TYPE` に載っている場合のみ、
`starts_at`/`ends_at`・`per_user_limit`・`per_event_limit`・`monthly_count_limit`/
`monthly_amount_limit`（**ルール単位＝全ウォレット横断**）・`global_amount_limit` を検証する。

| `transaction_type` | `rule_code` | 対象サービス |
|---|---|---|
| `REGISTRATION_BONUS` | `SENGOKU_REGISTRATION_BONUS` | `SENGOKU_PASSPORT` |
| `AIART_ATTENDANCE` | `AIART_ATTENDANCE_REWARD` | `AIART` |
| `SENGOKU_EC_PURCHASE` | `SENGOKU_EC_PURCHASE_REWARD` | `SENGOKU_EC` |

マッピングに無い `transaction_type`（`EVENT_REWARD` 等）では `reward_rules` の上限が
**一切効かず**、`service_integrations` の1リクエスト上限・1日上限だけが効く。

→ 「はじまりの旅」用に新しい `transaction_type` と `rule_code` を追加してもらうか、
既存の汎用種別を使って上限を**パスポート側で持つ**か（指示書§8.5はパスポート側の上限を要求している）の判断が要る。

#### エラー形式

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "..." }, "request_id": "..." }
```

主なコード: `API_KEY_REQUIRED`(401) / `INVALID_API_KEY`(401) / `VALIDATION_ERROR`(400) /
`FEATURE_DISABLED`(503) / `NOT_FOUND`(404) / `InsufficientBalanceError`(409) /
`WalletNotActiveError`(409) / `TransactionNotReversibleError`(409) / `INTERNAL_ERROR`(500)。

残高照会と代理店SSOのみ旧形式（NestJS標準に近い形）。

#### レート制限

外部APIは `@nestjs/throttler` のグローバル既定（60秒120リクエスト、**IPアドレス単位**）のみ。
APIキー単位の専用バケットは未実装。

#### 稼働状況 — [確認]（2026-08-20 ウォレット開発担当より回答）

- **本番稼働はしていない。正式な稼働開始時期も未定**
- **staging は稼働中**。API（Railway）・管理画面（Vercel）とも動作している。
  ただし実ユーザー向けの正式公開ではなく、**検証用の位置づけ**
- staging環境の**総アカウント数は2件**（初期管理者関連のみ）。実運用データはほぼ存在しない
- 千ノ国パスポート用の `service_integrations` 行（APIキー・署名鍵）は**未発行**

**結論**: 指示書§8.1の選択肢2（`MISSION_REWARDS_ENABLED` をOFFにして学習部分だけを検証）が、
選択肢ではなく**唯一の進め方**。ウォレット側からもこの進め方で問題ないとの回答を得ている。

確認事項は `docs/WALLET_INTEGRATION_QUESTIONS.md`、回答と決定は
`docs/WALLET_INTEGRATION_ANSWERS_20260820.md` を参照。

#### デプロイ状況 — [要接続]

> **訂正あり。** 当初、`docs/deployment.md` の記載に基づき「`AUTH_MODE=mock` で起動」と
> 書いていたが、**その文書自体が実態より古かった**。2026-08-20 のウォレット開発担当からの
> 回答で以下のとおり訂正された。

- 2026-07-18 の**実チャネルLINEログイン結合試験**の結果を受け、
  staging は **`AUTH_MODE=production` へ切り替え済み**。LINEログインは実チャネルで動作している
- **戦国パスポートSSOは引き続きモック実装**（相手方のAPI仕様が未確定のため）
- API（Railway）・管理画面（Vercel）とも稼働中

→ **「はじまりの旅」がstagingで疎通確認できるかは、`service_integrations` に
`SENGOKU_PASSPORT` 行を発行してもらえるか次第。** 発行は運用担当者の手動作業。
URL・APIキーはこのリポジトリからは分からない（秘密情報のため記載もしない）。

**教訓**: 相手方リポジトリのドキュメントも、コードや実環境より古い場合がある。
「相手方の文書に書いてある」ことは、相手方への確認を経るまで [要確認] を外さない。

### 12-b. 旧3,000 OVE 一括付与の正本 — [確認] ★重要

**ウォレット側にあった。** ただし「一括付与」ではなく、**まだ1件も確定付与されていない。**

`docs/agency-referral.md`（代理店紹介トークン受け入れ・登録特典 実装指示書 v1.0 Phase 1）:

- 新規登録時に、アカウント作成と同一トランザクションで
  `wallet_referrals` を `PENDING` へ更新し、**`wallet_referral_benefits` を `PENDING`（3,000 OVE）で作成**する
- **「3,000 OVEは今回は確定付与されず、常に `PENDING` のまま保留される」**（Phase 2で代理店システムから確認結果を受け取ってから確定する設計）
- Phase 2（代理店システム接続・確認結果反映・特典確定）と Phase 3（管理者の手動確定・取消・紹介者訂正）は**未実装**
- 額は環境変数 `REFERRAL_SIGNUP_BONUS_AMOUNT`（既定 `3000`）
- フラグ `ENABLE_WALLET_REGISTRATION_BONUS` は Phase 1 では**未参照**（確定付与するコード自体が無いため）
- 対応する取引種別は `REGISTRATION_BONUS` / `rule_code: SENGOKU_REGISTRATION_BONUS`

**含意**:
- 「既存参加者が3,000 OVEを受け取っている」という前提は、**現時点では成立していない可能性が高い**
- 正本は `wallet_referral_benefits`（ウォレット側）。**パスポート側には無い**
- 指示書§8.4の重複防止判定は、外部APIからは照会できない（取引履歴APIが無く、そもそも取引がまだ作られていない）
- **[要接続]** 実際に `PENDING` のまま残っているのか、別経路で確定付与されたのかは、ウォレット管理画面 `/wallet-referrals` または運営への確認が必要

### 13. 代理店情報取得APIの有無 — [確認] / [設定なし]

`src/lib/agents.ts` に外部代理店システム（sengoku-ai.com）との双方向連携が実装済み。

| 機能 | 関数 |
|---|---|
| 紹介コード→代理店ID解決 | `resolveAgentIdByReferralCode()` |
| 受信APIキー検証 | `verifyInboundApiKey()` |
| 代理店の取り込み | `upsertAgentFromSync()` |
| 代理店の送出 | `pushAgentToExternal()` |
| 疎通テスト | `testOutboundConnection()` |
| 階層同期 | `syncHierarchyFromAgency()` |

- 認証情報は `agency_integration_settings`（送信は `x-api-key`、受信は `x-api-key` と `Bearer` の両方を受け付ける）
- 紹介アトリビューション: `users.referring_agent_id`（登録時のファーストタッチ確定、以後変更不可）
- 階層計算は**外部側の責務**として `syncHierarchyFromAgency()` で取り込む形。パスポート側では計算していない（指示書§5の禁止事項と整合）

**[設定なし]** APIキー・接続先URLはDB設定のため、このサンドボックスからは疎通確認できない。

**「はじまりの旅」への含意**: §10「相談希望者の営業連携」は、**既存の紹介元代理店の仕組みをそのまま使える**。紹介者・担当者の解決を代理店システム側に委ねる方針も現状と一致している。

### 14. LINE通知処理の有無 — [確認]

| 用途 | 実装 |
|---|---|
| 個別push | `src/lib/line-push.ts` の `pushMessage(accessToken, lineUserId, text)` |
| 一斉配信 | `src/lib/line-broadcast.ts` |
| 設定 | `src/lib/line-settings.ts` → `line_settings` テーブル（`liff_id` / `messaging_channel_access_token` 等） |
| 業務通知のラッパ | `src/lib/castle-notifications.ts` |

`line-push.ts` のコメントに明記されている重要な制約:

> **LINE Messaging APIのpush送信はリトライキー機構が無い**ため、この関数は冪等キーを持たない。
> `notification_outbox_events` 経由の再送は「at-least-once、重複時は同一文面の通知がもう一度届く可能性がある（ベストエフォート）」仕様。

`castle-notifications.ts` の方針は**通知失敗で本来の処理を失敗させない**（`sendBestEffort` で握りつぶす）。例外は `notifyPlotPurchase()` で、呼び出し元が `notification_outbox_events` で追跡するため送信結果を返し失敗を伝播する。

**「はじまりの旅」への含意**: §17の `MISSION_LINE_NOTIFICATIONS_ENABLED` に対応する送信基盤は揃っている。ただし**LINE通知は冪等でない**ため、「OVE付与成功通知」を通知の到達で保証してはいけない。

### 15. `admin_audit_logs` の列・書込箇所・管理画面 — [確認]

現在の列（`20260708000011` + `20260729000001` の追加分）:

```sql
id uuid primary key default gen_random_uuid()
actor_name       text        -- 自己申告
action           text not null
details          text        -- 自由記述
created_at       timestamptz not null default now()
target_type      text        -- 20260729000001 で追加
target_id        uuid        -- 同上
before_snapshot  jsonb       -- 同上
after_snapshot   jsonb       -- 同上
```

- 書込は `src/lib/admin-audit-log.ts` の `logAdminAction()` に一本化。呼び出しは **106箇所**
- **記録失敗は握りつぶす**（`console.error` のみ。監査ログの失敗で管理操作を失敗させない）
- `AdminActionTarget.targetId` は必須の `string`。**複数対象を表現できない**ため、一括操作では target を渡さず件数のみ `details` に残す運用になっている
- 管理画面は `/admin/audit-logs`。表示しているのは `actor_name` / `action` / `details` / `created_at` のみで、**`target_type` / `target_id` / スナップショットは画面に出ていない**

**「はじまりの旅」への含意（指示書§7末尾）**:
指示書が要求する「対象種別・対象ID・管理者ロール・変更前後の値・リクエストID・操作理由」のうち、
**対象種別・対象ID・変更前後の値は既にある**が、
**管理者ロール（`admin_role`）・リクエストID（`request_id`）・操作理由（`operation_reason`）の3列が無い**。
既存106箇所を壊さない NULL許容列として追加する必要がある。新規監査テーブルは作らない。

### 16. outbox・原子的claim・fencing・要対応一覧の再利用可能範囲 — [確認]

**`integration_outbox_events`**（`20260805000001`）:

```sql
id, event_type, target_system_key, payload jsonb,
status text check (status in ('pending','sent','failed')),
attempt_count int, last_error text, created_at, sent_at
```

**`notification_outbox_events`**（`20260808000009`）: 上に加えて
`source_type` / `source_id` / **`unique (source_type, source_id, event_type, target_system_key)`**

原子的claim・fencing: `claim_integration_outbox_event()` / `claim_notification_outbox_event()`（`20260809000008`）。
共通ラッパは `src/lib/integration-outbox.ts`（`enqueueOutboxEvent` / `claimOutboxEventForDrain` / `markOutboxSentAfterClaim` / `markOutboxFailedAfterClaim`）と `src/lib/outbox-drain.ts`。

自動再送: `/api/internal/cron/integration-outbox` と `/api/internal/cron/notification-outbox`。認証は `Authorization: Bearer <CRON_SECRET>`。

要対応一覧: `/admin/integration-recovery`（滞留・失敗の一覧と手動drain）、`/admin/operations-health`（運用監視）。

**[設定なし] 既知の未設定事項**: Vercel の `CRON_SECRET` が未設定のため、**outboxの自動再送は現在動作していない**（手動drainのみ）。これは本機能以前からの既存課題。「はじまりの旅」でOVE付与要求をoutboxへ載せる場合、**このままでは自動再送されない**。

**再利用の判定**: 指示書§8.5「付与可能と判定した要求だけを `integration_outbox_events` へ登録し、原子的claim・fencingを再利用する」は**そのまま実現できる**。本機能専用のリトライ基盤を新設する必要はない（§5の禁止事項と整合）。

ただし `integration_outbox_events` には `notification_outbox_events` のような重複防止の一意制約が無いため、**冪等性は `learning_journey_reward_requests` 側の一意制約で担保する**必要がある。

### 17. CI・テスト・staging環境の状態 — [確認] / [要接続]

`npm run ci` = `lint && tsc --noEmit && test:unit && test:architecture && build`

| script | 内容 |
|---|---|
| `test` / `test:unit` | `vitest run`（35ファイル・348テスト、全通過） |
| `test:architecture` | `vitest run src/modules/architecture-rules.test.ts`（58テスト） |
| `test:integration` | `vitest run --config vitest.integration.config.ts`（Supabase local必須） |
| `test:contracts` | `vitest run --config vitest.contracts.config.ts`（同上） |
| `test:migrations` | `bash scripts/test-migrations.sh`（同上） |
| `test:concurrency` | `bash scripts/test-concurrency.sh`（同上） |

GitHub Actions（`ci.yml`、1本のみ）のジョブ:
`typecheck` / `lint` / `unit-test` / `architecture-test` / `build` / `migration-test` / `integration-test` / `contract-test`。
後半3つは `supabase start` でローカルDBを立てる。Supabase CLI は `SUPABASE_CLI_VERSION: "2.110.0"` に固定済み（`version: latest` だとGitHub APIのレート制限でCIが落ちるため）。

**アーキテクチャルール（`src/modules/architecture-rules.test.ts`）** — 「はじまりの旅」のモジュール設計に直接効く:

- `src/modules/*/domain/` は Next.js / Supabase SDK / Stripe / `@/lib/supabase-server` / `@/lib/stripe` を import してはいけない
- `src/modules/*/application/` は上記に加えて `.from(` / `.rpc(` / `createSupabaseServerClient(` / `fetch(` を**ソース文字列としても**含んではいけない（Repositoryインターフェース経由のみ）
- 判定対象は**親ディレクトリ名が literal に `domain` / `application` のファイルのみ**。`infrastructure/` と `presentation/` は対象外
- `import type` は対象外（コンパイル時に消えるため）

**[要接続]** staging環境: Supabase staging は存在するが、このサンドボックスからは到達できない。マイグレーションは手動適用 + `supabase_migrations.schema_migrations` への手動INSERT運用。

---

## 指示書と既存実装の差分・要注意点

| # | 内容 | 影響 |
|---|---|---|
| 0 | **OVEウォレット自体が開発中・未稼働** | PR5は着手不可。付与OFFでの実証が唯一の進め方。確認事項は `docs/WALLET_INTEGRATION_QUESTIONS.md` |
| 1 | **OVEの実体が無い**（`OveWalletCard` はモック、台帳なし、DBに `ove` を含む列なし） | PR5の前提。§8.1の3方針のうち、選択肢2（`MISSION_REWARDS_ENABLED` OFF）以外は現時点で選べない |
| 2 | **旧3,000 OVE は「未確定のPENDING」だった**（正本はウォレットの `wallet_referral_benefits`。確定付与するコードがまだ無い） | 「既存参加者は3,000 OVE受領済み」という前提が成立していない可能性が高い。§9.2・§19.1(4)(5)の再検討が必要 |
| 3 | **Wallet の付与APIは `common_user_id` を受け付けない**（`service_code` + `external_user_id` で解決） | 指示書§2(3)「基準識別子に common_user_id を使用する」とAPI仕様が噛み合わない。`external_user_id` に何を送るかの決定が必要 |
| 3-b | **外部サービス向けの取引履歴照会APIが存在しない**（残高の集計値のみ） | 指示書§8.4(1) が現状実現不可。(2) の移行データ取込か、ウォレットへのAPI追加依頼になる |
| 3-c | **`idempotency_key` はボディのフィールド**（ヘッダーではない） | §8.2の想定と実装が一致。ただし代理店システムの `Idempotency-Key` ヘッダー方式とは別規約なので混同しないこと |
| 4 | **`admin_audit_logs` に3列不足**（`admin_role` / `request_id` / `operation_reason`） | §7末尾の要求。NULL許容列の追加が必要 |
| 5 | **`CRON_SECRET` 未設定でoutbox自動再送が停止中** | §8.5でoutboxに載せても自動再送されない。本機能以前からの既存課題 |
| 6 | **`/passport` 接頭辞が存在しない** | §4.1の想定ルート `/passport/journey/...` は既存規約と不一致。`/journey/...` を推奨（§4.1は「既存ルーティング規約に合わせて最終決定する」としている） |
| 7 | **BottomNavの5枠が満杯** | 入口の配置は ホーム上部 or SideMenu が現実的 |
| 8 | **「本日の任務」と体験ミッションが同一行動で重なる** | §19.1(15) の運営判断が必要（AI寺子屋30pt・イベント20pt・市場5ptが既に付く） |
| 9 | **`project_key` の値が未決定** | §7.1のスコープ設計の前提。`agency_integration_settings.default_project_key` は列だけ存在し値が未設定 |
| 10 | **LINE push は冪等でない** | 「OVE付与成功」を通知到達で保証してはいけない |
| 11 | **`AdminActionTarget` は複数対象を表現できない** | 一括操作の監査ログは件数のみ記録する既存運用に合わせる |
| 12 | **未マージのPR #162 が存在** | 領域は重ならないが、マージ後は migration が `20260814000001` まで進む |

---

## 未確認事項一覧（指示書§18の成果物）

| # | 項目 | 区分 | 解消方法 |
|---|---|---|---|
| 1 | OVEW Wallet の稼働時期、APIキー発行、取引履歴照会APIの追加可否、`external_user_id` の合意 | [要接続] | `docs/WALLET_INTEGRATION_QUESTIONS.md` の回答待ち（API仕様自体はリポジトリ調査で確認済み） |
| 2 | 旧3,000 OVE 付与の主体と正本 | [要接続] | Wallet / 代理店 / AIアート教室 / 移行データの横断確認 |
| 3 | 共通IDハブ（sen-no-kuni HUB）への疎通 | [設定なし][要接続] | staging での接続テスト |
| 4 | 代理店システム（sengoku-ai.com）への疎通 | [設定なし][要接続] | staging での接続テスト |
| 5 | LINE Messaging API の疎通（push・LIFF） | [設定なし][要接続] | staging + 実機 |
| 6 | LINE外ブラウザでの再開動作 | [要接続] | 実機確認 |
| 7 | staging DB の現在のスキーマ状態 | [要接続] | staging 接続 |
| 8 | `project_key` に入れるべき値 | — | 運営判断 |
| 9 | §19.0 OVEの法的位置付け | — | 専門家確認 |
| 10 | §19.1 の16項目 | — | 運営判断 |

秘密情報（`SESSION_SECRET`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_PASSWORD`、`hmac_secret`、LINEアクセストークン、APIキー）の値は本書に一切記載していない。
