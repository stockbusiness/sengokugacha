# 城下町デジタル内覧 機能追加 — 既存システム調査

「戦国城下町 デジタル内覧」ハイブリッド機能追加の指示書に基づき、実装前に既存リポジトリを調査した結果。

## フロントエンド構成

- Next.js 16.2.10(App Router、Turbopack)。React 19.2.4、TypeScript strict。
- プレイヤー向け画面は `src/app/(app)/**`(ルートグループ)。共通レイアウトは `src/app/(app)/layout.tsx` で、`SideMenu`(ハンバーガードロワー)・下部ナビ・`LegalFooter` を持つ。
- 管理画面は `src/app/admin/(dashboard)/**`。共通レイアウトは `src/app/admin/(dashboard)/layout.tsx` で、上部に横並びのナビリンク一覧(フラット構造、階層メニューなし)。
- スタイリングはTailwind CSS v4(`@theme inline`トークン方式)。プレイヤー画面は戦国テーマ(ink/gold/crimson/purple、`src/app/globals.css`)、管理画面はzinc基調のシンプルな配色(ライト/ダーク対応、`AdminThemeProvider`)。
- コンポーネントは機能ドメインごとにディレクトリを分ける(`src/components/dashboard/`, `src/components/economy/`, `src/components/gacha/`, `src/components/effects/`, `src/components/hubs/`, `src/components/ui/` など)。

## バックエンド構成

- 別サーバーは無く、Next.jsのRoute Handler(`src/app/api/**/route.ts`)がAPIを兼ねる。
- APIはバージョンプレフィックス(`/api/v1/...`)を使わないフラット構成。例: `/api/gacha/draw`, `/api/me`, `/api/collection`, `/api/admin/warlords`, `/api/admin/warlords/[id]`。
- 管理画面向けAPIは全て `/api/admin/**` 配下に集約されている。

## 使用フレームワーク・言語

- Next.js 16.2.10 / React 19.2.4 / TypeScript 5系。
- Tailwind CSS v4、`sharp`(画像処理)、`@line/liff`(LIFF SDK)、`jose`(JWT署名・検証)、`@supabase/supabase-js`、`stripe`、`gsap`(Ver2.4で導入、演出アニメーション用)、`@sentry/nextjs`。

## LIFF SDK初期化・LINEログイン処理

- `src/lib/client/ensure-liff-session.ts` の `ensureLiffSession()` が全プレイヤー画面共通の入口。
  - LIFF ID・チャネル情報はDB(`line_settings`)から `GET /api/app-config` 経由で取得(環境変数ではない)。
  - `liff.init()` → 未ログインならログイン誘導 → IDトークン取得 → `POST /api/auth/line` にIDトークンを送信してサーバー側セッションを確立。
  - URLの `?ref=<referral_code>` は `sessionStorage`(キー `sengoku_ref_code`)に退避し、LINEログイン画面を経由して戻ってきても失われないようにしている。
- サーバー側検証: `src/lib/line.ts` の `verifyLineIdToken()` がLIFF IDトークンを検証し、`sub`(LINEユーザーID)・`name` を取得。
- `src/app/api/auth/line/route.ts` がエントリーポイント。検証後 `findOrCreateUserByLineId(lineUserId, displayName, refCode)`(`src/lib/passport.ts`)でユーザーを作成/取得し、`setSessionCookie({ userId })` でセッションを発行。

## ユーザー認証方法・セッション管理

- プレイヤー側: `src/lib/session.ts`。`jose` の `SignJWT`/`jwtVerify`(HS256、`SESSION_SECRET`環境変数)。httpOnlyクッキー `sengoku_session`、有効期限30日。
- 管理画面側: 完全に別方式。`src/lib/admin-session.ts`。共有パスワード(`ADMIN_PASSWORD`環境変数)1本のみで、個人アカウントは存在しない。ログイン成功時にJWT(`sengoku_admin_session`クッキー、12時間)を発行。ログイン時に入力した「担当者名」を操作ログ用に自己申告で記録する運用(本人確認ではない)。
- ミドルウェア: Next.js 16では `middleware.ts` が `proxy.ts` にリネームされている(`src/proxy.ts`)。管理画面配下(`/admin/**`、ログインページ除く)のセッション有無をチェックし、未ログインなら `/admin/login` へリダイレクト。

## ユーザーテーブル

`users`(`supabase/migrations/20260707000001_initial_schema.sql` 他、複数マイグレーションで列追加)。主な列:
- `id`, `line_user_id`(unique), `display_name`, `created_at`
- ゲーム内通貨・進捗: `kokudaka`(石高), `senko`(戦功), `gacha_tickets`
- 代理店紐づけ: `referring_agent_id`(→ `agents.id`、Ver2.0〜)
- 国民証・会員区分(Ver2.0〜2.1で追加、Ver2.4でプレイヤー向けUIは削除済み。DB列は維持): `national_number`, `contribution_points`, `is_founding_member`, `founding_member_number`, `development_plot_id`, `development_area`, `development_plot_status`, `is_nation_builder`, `nation_builder_plan`, `nation_builder_joined_at`

## 代理店テーブル・ユーザーとの紐づけ方法

- `agents`: `id`, `name`, `rank`(アドバイザー/ディレクター/エージェントの3値、フラット。階層構造や親子関係の列は存在しない)、`referral_code`(unique)、`created_at`。
- 紐づけは `users.referring_agent_id`(外部キー)。**新規登録時のみ設定され、以後は上書きされない**(ファーストタッチ確定方式)。既存ユーザーが別の紹介リンクを踏んでも変化しない。
- 購入時の代理店実績記録は「購入時点の `referring_agent_id` を都度参照」する方式(`src/app/api/stripe/webhook/route.ts` の `recordAgentSaleIfReferred`)。`agent_sales` テーブルに購入記録が入る。
- 代理店側の権限分離(「自代理店のデータのみ閲覧可能」)は**現状未実装**。管理画面ログインは共有パスワード1つのみで、代理店ごとのログインアカウント・ロールの概念が無い。今回の指示書 28章「代理店管理者」ロールは、既存の権限モデルには存在しないため新設が必要。

## 管理画面の構成

- フラットなトップナビ(`layout.tsx` にリンクをハードコード)。階層メニュー(サブメニュー折りたたみ等)は無い。今回の指示書が要求する「メタバース内覧管理」配下の10機能をこの構造にどう収めるか検討が必要(素直に付け足すとナビが更に横に伸びる。折りたたみ導入は既存パターンからの逸脱)。
- 個別ページの典型パターン: `"use client"` の単一 `page.tsx` が `fetch` でAPIを呼び、ローカルstateで一覧・編集を管理(サーバーコンポーネント+フォームアクションではなく、クライアントサイドfetch方式で統一されている)。
- 一覧+インライン編集(国マスタ・武将マスタ等)、または一覧+別ページの新規/編集フォーム(動画演出 `gacha-animations` が唯一の別ページパターン: `page.tsx`(一覧) / `new/page.tsx` / `[id]/page.tsx` + 共有 `AnimationForm.tsx`)の2パターンが混在。後者が今回の物件管理(項目数が多い)に近い。
- Ver2.4で `/admin/help` を新設済み(使い方ガイド)。今回追加する画面群も、この使い方ガイドへの追記が期待される。

## API設計

- Route Handlerベース。プレイヤー向けは `GET`/`POST` が中心、管理画面向けは `GET`/`POST`/`PATCH`/`DELETE` のRESTライクな構成。バージョニングなし。
- レスポンスはJSON。成功時はデータをそのまま返す(`{ success: true, data: ... }` のような共通ラッパーは使っていない)。エラー時は `{ error: "..." }` + 適切なHTTPステータス。
- 認証チェックは各Route Handler内で個別に実施(`getSession()`/`getAdminSession()` を呼ぶ)。共通ミドルウェアでのAPI認証はプレイヤー向けAPIには無く、ページ側の `ensureLiffSession()` に依存している箇所がある(要確認: 一部APIは未ログインでも200を返しうる設計になっている可能性があるため、新規APIは個別に認証チェックを入れる)。

## データベース構成・ORM

- Supabase Postgres。RLS(Row Level Security)は有効化されているが、基本方針は「deny-all」で、実際のアクセス制御はサーバー側(Route Handler)がservice-role鍵で行う。クライアントから直接Supabaseを呼ぶコードは無い。
- ORM不使用。`@supabase/supabase-js` の `.from(table).select()/.insert()/.update()` を直接使う素朴なクエリビルダー方式。
- マイグレーションは `supabase/migrations/*.sql` に日付+連番のファイル名で追加。**重要な既知の問題**: CIにマイグレーション自動適用の仕組みが無く、過去に複数バージョン分が本番未適用のまま稼働していた事象がある(`docs/FEATURES.md` 4章に記載)。今回追加するマイグレーションも、Supabaseダッシュボードから手動実行する運用を前提にする必要がある。

## 画像保存・アップロード方法

- Supabase Storageバケット。`src/lib/image-upload.ts` に用途別のリサイズプリセット関数:
  - `resizeForLine()`: 長辺1080px、WebP品質85(武将画像等の通常表示用)
  - `resizeForRichMenu()`: 2500×1686固定、JPEG(品質を段階的に下げて1MB未満に収める、LINEリッチメニュー専用)
  - ガチャ動画ポスター用のプリセットも存在(`gacha-animations`関連)
- アップロードは管理画面から `multipart/form-data` でPOSTし、サーバー側で `sharp` によりリサイズ後、Supabase Storageへアップロードしてpublic URLを返す。
- MP4動画は `src/lib/mp4-probe.ts`(自前のISO BMFFパーサー)で長さ・解像度・音声有無を検証(ffmpeg等のネイティブ依存なし)。内覧画像はJPEG/PNG/WebPのみのため、この動画パーサーは今回は不要。

## 既存ショッピングカートとの接続

- **カート機能は存在しない**。Stripe Checkout Sessionを都度1商品(石高パックまたはガチャ券パック)単位で作成する方式(`src/app/api/purchase/checkout/route.ts`)。複数商品を組み合わせて購入する仕組みは無い。
- 今回の指示書は「直接決済はせず、相談フォームで代理店へ誘導する」設計のため、決済連携自体は不要(ユーザーとの合意により、価格・権利情報自体もアプリ内に表示しない方針に変更済み。後述)。

## マイページ構成

- **「マイページ」という独立ルートは存在しない**。ホーム画面(`/`、`src/app/(app)/page.tsx`)が国家ダッシュボード件マイページ的な役割を兼ねている(国民証・ステータス・任務・貢献ポイント等を集約表示)。
- 指示書19章「既存マイページへの追加」は、実際にはこのホーム画面への追加として読み替える必要がある。ただしホーム画面は既にVer2.0〜2.4で情報量が多く、これ以上カードを積み増すと縦に長大化する懸念がある(実装計画で対応方針を検討)。

## ログ・分析機能

- `user_activity`(Ver2.3): 国家貢献ポイントの活動ログ(武将登用・AI寺子屋・イベント・市場閲覧・ログイン)。汎用的な「画面閲覧イベント」記録の仕組みではない。
- `admin_audit_logs`(`src/lib/admin-audit-log.ts`)。金銭・法務・ゲーム経済に関わる操作のみ記録、軽微な編集は対象外という方針。
- ガチャ動画演出の分析イベント(`POST /api/gacha/animation-event`)が唯一の「フロントエンドから逐次イベント送信→DB記録」の先例。今回の27章「閲覧ログ」はこのパターンを踏襲できる。
- Sentryでのエラー監視は導入済み(`@sentry/nextjs`)。

## デプロイ環境・環境変数

- Vercelでのホスティング(本番URL: `https://sengokugacha.vercel.app`、過去のやり取りで確認済み)。
- 環境変数(`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`。LIFF ID・LINEチャネル情報は環境変数ではなく管理画面(`/admin/line-settings`)からDB設定する方式。今回の外部内覧サイトを別ドメイン/別オリジンで立てる場合、CORSやトークン検証用の追加環境変数が必要になる可能性がある(実装計画で検討)。

## テスト構成

- Vitest。現状2ファイルのみ(`src/lib/gacha-rate-tiers.test.ts`, `src/lib/login-streak.test.ts`)。E2Eテストの仕組み(Playwright等)は開発用に一時的に使うのみで、常設のE2Eテストスイートは存在しない。
- CI(GitHub Actions, `.github/workflows/ci.yml`)は `lint` → `tsc --noEmit` → `vitest run` → `build` の順。マイグレーション適用・デプロイは含まれない。

## 既存コンポーネントで再利用できるもの

- `src/components/ui/`: `Card`, `Button`(`LinkButton`/`TextLink`), `PageHeader`, `LoadingSpinner` — 内覧UIの土台にそのまま使える。
- `src/components/effects/CelebrationBurst.tsx`(Ver2.4、GSAP)— 演出用に流用できる可能性はあるが、内覧機能の主目的とは異なる。
- `src/lib/client/ensure-liff-session.ts` — 内覧トップ・エリア一覧等、全LIFF内画面で必須。
- `src/components/hubs/ExternalLinkCard.tsx` — 既存の「外部リンクへの遷移カード」パターン。ただし今回は自前のトークン付き内部URLへの遷移のため、単純な流用ではなく新規コンポーネントが必要。
- 画像アップロードの管理画面UI(`src/app/admin/(dashboard)/warlords/page.tsx` の実装)がそのままエリア/物件/シーンの画像アップロードUIの参考になる。

## 指示書との主な差異・調整が必要な点

1. **代理店の階層・ロール分離が存在しない**: `agents`テーブルにランクはあるが親子関係は無く、代理店ごとのログイン・権限も無い。28章「代理店管理者」ロールを実現するには、代理店専用ログインの新設が必要(スコープが大きいため、実装計画で段階分けを提案する)。
2. **APIバージョニングなし**: 指示書の `/api/v1/...` は既存規則(バージョンなしフラット構成)に合わせ、`/api/metaverse/...` `/api/admin/metaverse/...` に変更する。
3. **マイページが独立ルートでない**: ホーム画面への追加として実装する。
4. **カート機能が無い**: 今回は決済を行わないため無関係。
5. **販売情報(価格・権利・特典・販売状態)をアプリ内に表示しない方針への変更**: ユーザーとの確認の結果、本機能は「内覧・閲覧を楽しむコンテンツ」として実装し、価格・権利内容・特典・商業的な販売状態(残りわずか/商談中/売約済み等)はアプリ内に一切表示しない。詳細は実装計画に記載。
6. **管理画面が階層メニューを持たない**: 10機能を既存のフラットナビにどう統合するかは実装計画で提案する。
