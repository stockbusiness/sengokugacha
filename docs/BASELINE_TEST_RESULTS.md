# 千ノ国パスポート モジュール化 Phase 0: 既存挙動のベースライン

`SEN_NO_KUNI_PASSPORT_MODULARIZATION_INSTRUCTIONS.md` §5(Phase 0: 既存挙動のテスト固定)の提出物。モジュール分割着手前に、現状の挙動を記録する。

## 前提: 自動テストの範囲

本リポジトリにはDBモック基盤が無く(P0-2 PR-Gで確認済みの制約)、Supabaseへの実際の呼び出しを含む処理は自動テスト化できない。そのため:

- **DBに依存しない純粋関数**は、通常どおりvitestで自動テスト化し、以下の各セクションに実行結果を記載する。
- **DBに依存するフロー**(LINEログイン、Stripe決済、HMAC認証等のほとんど)は、自動テストの対象にはできないため、本書でソースコードから読み取った現状の動作を記録する(仕様書として固定し、モジュール分割後にこの記述と食い違う変更が入っていないかをレビューで確認する)。

本書はモジュール化の各PRが進むごとに更新する(現時点ではPR2「ガチャ・国取り」・PR5「代理店・共通ID」・PR8「決済・権利」・PR11「integrations」・PR12「Stripe Webhook」・PR13「セッション基盤」分の自動テストが完了)。

## ガチャ・国取り(PR2で自動テスト化、PR3/PR4でdomain層へ移設済み)

| 対象 | テストファイル | 内容 |
|---|---|---|
| 排出率ティア選択 | `src/lib/gacha-rate-tiers.test.ts`(既存) | `pickTierRates()`: 制圧数に応じたティア境界の選択、空リスト時のフォールバック |
| 排出スロット判定 | `src/modules/gacha/domain/draw-policy.test.ts` | `pickSlot()`: 乱数値に応じたrare/mid/common境界(`Math.random()`をモック) |
| イベント期間判定 | `src/modules/gacha/domain/draw-limit.test.ts` | `isEventWindowActive()`: 開始/終了未指定時は無制限、期間内外の判定(`vi.useFakeTimers()`で現在時刻を固定) |
| 美濃国解放判定 | `src/modules/gacha/domain/draw-limit.test.ts` | `didJustUnlockMino()`: しきい値到達時のみtrue、既に超えていた場合・未設定時はfalse |
| 国家貢献ポイント計算 | `src/modules/gacha/domain/rarity.test.ts` | `calcContributionPoints()`: スロット別基礎点+新規カードボーナスの加算 |
| 国制覇判定(所持武将) | `src/modules/conquest/domain/conquest-policy.test.ts` | `isConquestSatisfied()`: 必須武将の充足判定 |
| 地方コンプ実績スラグ | `src/modules/conquest/domain/region-completion.test.ts` | `regionCompleteAchievementType()`: 既知/未知地方の変換 |
| 地方コンプ石高ボーナス | `src/modules/conquest/domain/region-completion.test.ts` | `getRegionKokudakaBonus()`: 制圧国数に比例した加算 |
| 城解放条件 | `src/lib/castle-unlock.test.ts`(既存) | `isCastleUnlocked()`: 主要国制圧・地方コンプ条件、誤ロック防止のフォールバック |
| 連続ログインボーナス | `src/lib/login-streak.test.ts`(既存) | `getStreakBonusDraws()`: 7日/30日しきい値 |

### DB依存のため自動テスト対象外(ソースコードから記録)

- **ガチャ券不足**: `drawPaidGacha()`が`consumeGachaTicket()`(Postgres関数`consume_gacha_ticket`、原子的UPDATE)を呼び、残高不足時は`insufficient_gacha_tickets`例外→`InsufficientTicketsError`に変換(`src/lib/gacha.ts`)。
- **日次上限**: `getTodaysDrawCount()`が当日0時(サーバーローカル時刻、`new Date().setHours(0,0,0,0)`)以降の`gacha_logs`件数を数え、`getEffectiveFreeLimit()`/`getEffectivePaidLimit()`の上限と比較する。タイムゾーンはサーバーローカルであり、日本時間とずれる可能性がある既知の制約(`04_SYSTEM_ANALYSIS_REFERENCE.md`でも指摘済み、Phase 1で追加した`formatDateInTimezone()`により将来修正可能な土台のみ用意済み、今回は未修正)。
- **武将重複数**: `addWarlordToUser()`が既存行があれば`count`をインクリメント、無ければ新規作成。
- **演出失敗時の継続**: `selectAnimationForDraw()`の失敗を`.catch()`で捕捉し`null`を返す。ガチャ抽選自体は成功として扱われる。
- **国制覇の反映**: `maybeConquerProvince()`が`conquest_rules`優先、無ければ「その国の武将を全部所持」でフォールバック判定し、`user_provinces`をupsertする。

## 代理店・共通ID(PR5で自動テスト化済み)

| 対象 | テストファイル | 内容 |
|---|---|---|
| 代理店ランク解決 | `src/modules/agency/domain/rank-resolution.test.ts`(PR6でdomain層へ移設済み) | `resolveRank()`: `role_label`優先、`role_level`フォールバック、いずれも不明なら`アドバイザー`既定値 |
| 代理店階層の平坦化 | `src/modules/agency/domain/hierarchy.test.ts`(PR6でdomain層へ移設済み) | `flattenHierarchy()`: ネストしたツリーを親→子の順に平坦化、`external_id`欠落ノードのスキップ、`agent_code`/`parent_code`へのフォールバック |
| 国家建設率計算 | `src/modules/passport/domain/nation-building-rate.test.ts`(PR7でdomain層へ移設済み) | `calcNationBuildingRate()`: 各比率の重み付け平均(国盗り40%・図鑑30%・ログイン継続15%・任務15%)、ログイン継続日数の30日キャップ |

### DB/JWT依存のため自動テスト対象外(ソースコードから記録)

- **LINEログイン・新規登録**: `findOrCreateUserByLineId()`(`src/lib/passport.ts`)が`users.line_user_id`で検索し、無ければ`referring_agent_id`/`referral_session_key`を新規登録時のみ設定して`insert`する。既存ユーザーの`display_name`・紹介者は上書きしない(ファーストタッチ確定方式)。
- **共通ID/紹介連携の同期**: `syncCommonUserHub()`が`common_user_id`未解決時のみ`resolveCommonUserId()`を呼び、新規ユーザーかつ`referral_session_key`がある場合のみ`confirmReferral()`を呼ぶ。いずれもfail-open(失敗してもログイン処理は継続)。
- **代理店同期(`upsertAgentFromSync`)**: `external_id`をキーにupsertし、`parent_external_id`が未解決でもエラーにせず保存、後から親が届いた時点で子の`parent_agent_id`を再解決する(自己参照解決ロジック)。
- **代理店SSO検証**: `verifyAgencySsoToken()`(`src/lib/agency-sso.ts`)がRS256署名・issuer・audience・有効期限をJWKS経由で検証し、`jti`のワンタイム利用を`agency_sso_used_jti`のunique制約(23505)で検知する。無効化済み代理店(`status='inactive'`)はログイン不可。
- **HMAC認証(新規千ノ国連携)**: `verifySenNoKuniHubRequest()`がタイムスタンプ許容誤差5分以内、`HMAC-SHA256(timestamp + "." + raw_body)`の一致、nonceのワンタイム利用(unique制約)を検証する(署名検証はP0-2で完了済み、既存のvitestテストは無し。契約書v1.1 DRAFTで署名対象文字列の全システム合意が未確定のため、現行実装を安易に変更しない方針、詳細は`docs/IMPLEMENTATION_STATUS_P0_2.md`参照)。

## 決済・権利(PR8で棚卸し・自動テスト化済み)

`src/lib/atomic-balance.ts`・`src/lib/entitlements.ts`・`src/lib/shopping-order-events.ts`・
`src/lib/integration-outbox.ts`・`src/lib/purchases.ts`・`src/lib/purchase-grants.ts`・
`src/lib/stripe.ts`・`src/lib/commission-rule-sets.ts`を棚卸しした結果、これらはいずれも
Supabase呼び出しに直結する薄いラッパー(DB CRUD・Postgres関数呼び出し・外部HTTP送信)のみで
構成されており、新たに切り出せる純粋関数は無かった。決済・権利領域の純粋関数は、既存の
P0-2作業までにすべて自動テスト化済みであることを確認した(以下)。

| 対象 | テストファイル | 内容 |
|---|---|---|
| 城主契約の状態遷移 | `src/modules/castle/domain/contract-state.test.ts`(PR10でdomain層へ移設済み) | `isValidContractTransition()`: 9状態の遷移マトリクス、`canOperatorPerformTransition()`: operator/manager権限分岐 |
| 外部注文の状態遷移 | `src/modules/commerce/domain/order-state.test.ts`(PR9でdomain層へ移設済み) | `isValidExternalOrderTransition()`: draft〜rights_granted/cancelled/refundedの遷移マトリクス、`canOperatorPerformOrderTransition()`: 権限分岐 |
| 外部注文の割当状態算出 | `src/modules/commerce/domain/order-assignment.test.ts`(PR9でdomain層へ移設済み) | `computeOrderAssignmentStatus()`: 複数区画注文(7-1/7-2)の割当済み数量からplot_assignment_pending/partially_assigned/ready_to_grantを算出 |
| 報酬エンジン | `src/modules/castle/domain/commission-engine.test.ts`(PR10でdomain層へ移設済み) | `computeLandSaleCommissionLines()`/`computeRefundAdjustments()`: 要件書8.7 TC1〜TC7全ケース |
| HMACペイロードハッシュ | `src/lib/integration-inbox.test.ts`(既存) | `computePayloadHash()`: 同一本文で同一ハッシュ、本文差分・空白差分での不一致(冪等性判定の基礎) |

### DB依存のため自動テスト対象外(ソースコードから記録)

- **残高の原子的更新**: `adjustUserBalance()`/`consumeGachaTicket()`(`src/lib/atomic-balance.ts`)がPostgres関数`adjust_user_balance`/`consume_gacha_ticket`をRPC呼び出しし、read-modify-write競合を回避する。ガチャ券残高不足時は`insufficient_gacha_tickets`メッセージの例外を送出する。
- **購入権利付与のステップ冪等化**: `runPurchaseGrant()`(`src/lib/purchase-grants.ts`)が`purchase_grant_steps`テーブルでステップ単位(balance_granted/plot_completed/commission_posted/agent_sale_recorded/referral_confirmed/notification_sent)の完了状態を管理し、既にcompletedのステップは再実行しない。全ステップ成功で`purchases.status='completed'`・`grant_status='granted'`、失敗時は`grant_status='failed'`を記録して例外を投げ直す。
- **Stripe Webhook本体**: `src/app/api/stripe/webhook/route.ts`が`stripe_webhook_events`へ`stripe_event_id`単位でupsertし二重処理を防止、`purchases.status`を`processing`へ更新後に`runPurchaseGrant()`を呼ぶ(全体統合対応PR1/PR2)。
- **権利付与・取消**: `handleEntitlementGranted()`/`handleEntitlementRevoked()`(`src/lib/entitlements.ts`)が`entitlement_id`+`source_system_key`単位で冪等処理し、`entitlement_type`が`kokudaka`/`gacha_ticket`の場合のみ`adjustUserBalance()`で残高反映する。grant/revokeの順序逆転(revokeが先に届く場合)は`entitlement_pending_revocations`に保留し、grant到着時に適用する(P0-2 §4.3/4.4)。
- **購入・返金イベント記録**: `recordShoppingOrderEvent()`(`src/lib/shopping-order-events.ts`)が`shopping_order_events`へ`source_system_key`+`event_id`単位で冪等insertする(監査目的、当面は残高・権利への副作用なし)。
- **Outbox送達管理**: `enqueueOutboxEvent()`/`markOutboxEventSent()`/`markOutboxEventFailed()`(`src/lib/integration-outbox.ts`)が`integration_outbox_events`への送達記録・再送用ステータス管理を行う。
- **Inboxの原子的claim**: `claimInboxEvent()`(`src/lib/integration-inbox.ts`)がPostgres関数`claim_integration_inbox_event`経由でINSERT ON CONFLICT+SELECT FOR UPDATEにより、同一`event_id`への並行リクエストのうち1件のみが実処理を行うようclaimする(P0-2 §4.5でバグ#5修正済み)。
- **月間利用上限判定**: `getMonthlySpentYen()`(`src/lib/purchases.ts`)が当月(サーバーローカル日付基準)の`completed`購入金額を合計する。

## integrations(PR11でAPIルート薄型化・自動テスト化)

千ノ国パスポート モジュール化指示書 Phase 5(§15 PR11)。`src/app/api/integrations/sen-no-kuni-hub/route.ts`
(新規HMAC連携の受信エンドポイント)に埋め込まれていたevent envelope検証ロジック(DB非依存部分)を
`src/modules/integrations/domain/event-envelope.ts`へ抽出し、新規にテストを追加した。

| 対象 | テストファイル | 内容 |
|---|---|---|
| event_versionのサポート判定 | `src/modules/integrations/domain/event-envelope.test.ts` | `isSupportedEventVersion()`: サポート対象("1.0")の判定 |
| event_id解決 | `src/modules/integrations/domain/event-envelope.test.ts` | `resolveEventId()`: Idempotency-Keyヘッダー/body.event_idの優先順位・不一致検知(P0-2バグ#7) |
| source_system_key整合性判定 | `src/modules/integrations/domain/event-envelope.test.ts` | `isSourceSystemKeyConsistent()`: body側省略時は許容、HMAC認証済みsystemKeyとの不一致検知(§6.2) |

### DB依存のため自動テスト対象外(ソースコードから記録)

- **HMAC検証〜ディスパッチ本体**: `route.ts`のPOSTハンドラ自体(`verifySenNoKuniHubRequest()`によるHMAC認証、`claimInboxEvent()`による原子的claim、`EVENT_HANDLERS`によるイベント種別ごとのハンドラ呼び出し)はSupabase呼び出しに直結するためDB統合テスト基盤が無い本リポジトリでは自動テスト化できない。事前条件チェック(event_version・event_id・source_system_key)のみを純粋関数として抽出し、その他のディスパッチ処理はroute.tsに残した(PR3/PR4/PR6/PR7/PR9/PR10と同じ保守的方針)。

## Stripe Webhook(PR12でAPIルート薄型化・自動テスト化)

千ノ国パスポート モジュール化指示書 Phase 5(§15 PR12)。`src/app/api/stripe/webhook/route.ts`に
埋め込まれていたStripe event inbox(`stripe_webhook_events`)の冪等判定ロジックのうち、DB非依存の
判定部分を`src/modules/commerce/domain/stripe-inbox.ts`へ抽出し、新規にテストを追加した。

| 対象 | テストファイル | 内容 |
|---|---|---|
| Stripe inboxの冪等判定 | `src/modules/commerce/domain/stripe-inbox.test.ts` | `decideStripeInboxAction()`: 既存行が無い場合は新規処理、`status='succeeded'`なら重複としてskip、それ以外(failed/processing)はattempt_countを1増やして再処理 |

### DB依存のため自動テスト対象外(ソースコードから記録)

- **署名検証〜権利付与本体**: `route.ts`のPOSTハンドラ自体(`stripe.webhooks.constructEvent()`によるStripe署名検証、`stripe_webhook_events`へのinsert/update、`handleCheckoutSessionCompleted()`によるpurchasesのpending→processing原子遷移+`runPurchaseGrant()`呼び出し)はStripe SDK・Supabase呼び出しに直結するため自動テスト化できない。冪等判定(既存行の状態からskip/処理継続を決める部分)のみを純粋関数として抽出し、その他の処理はroute.tsに残した(PR3/PR4/PR6/PR7/PR9/PR10/PR11と同じ保守的方針)。
- **返金処理**: `src/app/api/admin/purchases/[id]/refund/route.ts`はStripe返金API呼び出し・区画/残高の取消・監査ログ記録を一連で行う。純粋関数として切り出せる判定ロジックは無く(itemTypeによる分岐は既存のgrantPurchase()と同型の単純なマッピングのみ)、全体がDB/Stripe SDK依存のため今回は対象外。

## セッション基盤(PR13でshared/auth抽出・自動テスト化)

千ノ国パスポート モジュール化指示書 Phase 6(§8・§15 PR13、セッション基盤統一)。
`src/lib/session.ts`・`admin-session.ts`・`agent-session.ts`の3ファイルで三重に重複していた
`SESSION_SECRET`解決+jose(HS256)署名/検証ロジックを`src/shared/auth/`へ集約した。
Cookie名(`sengoku_session`/`sengoku_admin_session`/`sengoku_agent_session`)・有効期限
(30日/12時間/12時間)・各ファイルのクレーム形状・Cookie読み書きは一切変更していない
(このモジュールはJWTの署名・検証のみを担う)。

JWTの署名・検証自体は`cookies()`(Next.jsのリクエストコンテキスト)を必要とせず、
`SESSION_SECRET`環境変数さえあれば動作するDB非依存の処理であるため、これまで
「DB/JWT依存のため自動テスト対象外」としていた3ファイルのうち、署名・検証部分のみを
初めて自動テスト化できた。

| 対象 | テストファイル | 内容 |
|---|---|---|
| セッションJWTの署名・検証 | `src/shared/auth/jwt-session.test.ts` | `signSessionJwt()`/`verifySessionJwt()`: 正常系のラウンドトリップ、クレーム形状の保持、不正トークン・期限切れ・別シークレットでの検証失敗(null)、`SESSION_SECRET`未設定時の例外 |

### DB依存のため自動テスト対象外(ソースコードから記録、変更なし)

- **Cookieの読み書き**: `setSessionCookie()`/`setAdminSessionCookie()`/`setAgentSessionCookie()`・`getSession()`/`getAdminSession()`/`getAgentSession()`は`next/headers`の`cookies()`(リクエストコンテキスト)に依存するため、本リポジトリの単体テスト環境では自動テスト化できない。JWTの署名・検証部分のみをPR13で`shared/auth`へ切り出し、Cookie読み書き自体はこれまで通り各ファイルに残した。

## 検証結果

- `rm -rf .next && npx tsc --noEmit`: エラーなし
- `npm run lint`: 既存の`<img>`警告2件のみ(本作業と無関係)
- `npx vitest run`: 132/132 pass(モジュール化PR2で2ファイル・17テスト、PR5で2ファイル・10テストを追加。PR8は既存テストの棚卸しのみで新規テスト追加なし。PR11で1ファイル・10テスト、PR12で1ファイル・5テスト、PR13で1ファイル・6テストを追加)
- `npm run build`: 成功
