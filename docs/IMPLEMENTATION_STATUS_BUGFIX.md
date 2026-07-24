# 千ノ国パスポート モジュール化後バグ修正 実装状況

`SEN_NO_KUNI_PASSPORT_POST_MODULARIZATION_BUGFIX_INSTRUCTIONS.md`の提出物。PRごとの実装状況を、以下7区分で報告する。

1. ソースコード上で実装済み
2. unit test確認済み
3. DB統合テスト確認済み
4. 実環境接続確認済み
5. 本番確認済み
6. 未確認
7. 未対応

## 前提: 検証方針(ユーザー確認済み)

本リポジトリにはDB統合テスト基盤が無く(`.env.local`は本番相当のSupabaseプロジェクトを指しており、ローカルPostgresqlは未構築)、Postgres関数を含む本改修の並行実行安全性を自動テストで実地検証する手段が無い。ユーザーへ確認の上、**コードレビューのみで実装を進める**方針とした(Supabase local環境の構築はPhase B-3として別途判断)。そのため、本書の各項目のうち「3. DB統合テスト確認済み」「4. 実環境接続確認済み」「5. 本番確認済み」は、別途ユーザー側での実施を要する。

## Phase A-1: 購入権利付与の完全冪等化

### PR1: fix: atomically claim purchase grant steps

| 項目 | 状況 |
|---|---|
| §4.3.1 ステップclaim(`claim_purchase_grant_step`/`mark_purchase_grant_step_completed`/`mark_purchase_grant_step_failed`、claim_tokenによるfencing) | 1. ソースコード上で実装済み |
| §4.3.4 手動再実行の排他制御(manager限定・guard-clause update・409・監査ログ) | 実装済み(PR3/P0-2時点で対応済み、本PRでの変更なし) |
| 並行実行時の受入条件(§4.4、同一購入10並列実行で副作用1回等) | 6. 未確認(コードレビューのみ、DB統合テスト未実施) |
| §4.3.2 DB内副作用の一体化(残高付与とステップ完了を同一トランザクションにする専用関数) | 7. 未対応(PR2で対応予定) |
| §4.3.3 外部副作用のoutbox化(紹介confirm・通知) | 7. 未対応(PR3で対応予定) |

**実装内容の要約**: `purchase_grant_steps`にclaim_token・lease_expires_at列を追加し、Postgres関数`claim_purchase_grant_step()`でSELECT ... FOR UPDATEによる行ロック+状態遷移判定を原子的に行う。呼び出し元(`src/lib/purchase-grants.ts`の`runStep()`)は返り値のclaim_tokenを保持し、副作用完了後に`mark_purchase_grant_step_completed()`/`mark_purchase_grant_step_failed()`へ渡す。claim_tokenが一致しない更新は無視される(fencing)ため、lease切れ後に別のリクエストへ再claimされた古いworkerが誤って完了・失敗の更新を行うことはない。

**未解決の既知の制約**: 副作用の実行(`fn()`)自体と、その後の`mark_purchase_grant_step_completed()`呼び出しは、依然として2つの別々のDB操作である。副作用が成功した直後、`mark_purchase_grant_step_completed()`が呼ばれる前にプロセスが落ちた場合、そのステップは`processing`のまま残り、lease_expires_at経過後に別のリクエストが再claimして`fn()`を再実行してしまう(=依然として二重実行の可能性が残る)。この残存リスクを解消するには、副作用自体をPostgres関数内に統合し、ステップ完了更新と同一トランザクションにする必要があり、これは§4.3.2としてPR2で対応する(`balance_granted`/`agent_sale_recorded`ステップが対象)。`plot_completed`/`commission_posted`/`notification_sent`/`referral_confirmed`ステップは、それぞれ`src/lib/plot-reservations.ts`/`castle-commissions.ts`/`castle-notifications.ts`/`common-user-hub.ts`のDB操作・外部API呼び出しを含み、PR2/PR3で個別に検討する。

### PR2: fix: make balance grants transactional and idempotent

| 項目 | 状況 |
|---|---|
| §4.3.2 DB内副作用の一体化(`balance_granted`/`agent_sale_recorded`) | 1. ソースコード上で実装済み |
| 並行実行時の受入条件(§4.4) | 6. 未確認(コードレビューのみ、DB統合テスト未実施) |
| §4.3.3 外部副作用のoutbox化(紹介confirm・通知) | 7. 未対応(PR3で対応予定) |
| `plot_completed`/`commission_posted`/`notification_sent`ステップの同一トランザクション化 | 7. 未対応(区画・報酬元帳のDB書込を伴う大掛かりな変更のため、今回のPRスコープには含めない。残存リスクはPR1と同じ「processingのまま残る可能性」がある) |

**実装内容の要約**: PR1で導入した`claim_purchase_grant_step()`をネスト呼び出しする新規Postgres関数`apply_purchase_balance_grant()`(石高・ガチャ券)・`record_purchase_agent_sale()`(agent_sales記録)を追加した。ネストされた関数呼び出しは呼び出し元と同一トランザクションで実行されるため、`claim_purchase_grant_step()`内のSELECT ... FOR UPDATEによる行ロックは関数全体の実行中(claim検証→残高加算/agent_sales記録→ステップ完了記録)保持され続ける。これにより、途中でプロセスが落ちた場合はトランザクション全体がロールバックされ(claimの`processing`遷移ごと巻き戻る)、副作用だけが反映されたまま次回へ持ち越されることが無くなる(true all-or-nothing)。PR1時点で残っていた「副作用成功後・completed更新前にプロセスが落ちる」ケースの二重実行リスクは、この2ステップについて解消された。

`src/lib/purchase-grants.ts`の`grantPurchase()`/`recordAgentSaleIfReferred()`(旧実装、`runStep()`でラップされていた)は削除し、`applyBalanceGrantStep()`/`recordAgentSaleStep()`(新Postgres関数を直接呼び出す)へ置き換えた。

## Phase A-2: entitlement付与・取消の完全冪等化

### PR3: fix: atomically apply and reverse entitlements

| 項目 | 状況 |
|---|---|
| §5.3 原子的claim(`claim_entitlement_application`/`claim_entitlement_reversal`) | 1. ソースコード上で実装済み |
| §5.4 残高反映とのトランザクション統合(`process_entitlement_grant`/`process_entitlement_revocation`) | 1. ソースコード上で実装済み |
| §5.5 `user_id=null`の再解決(entitlement処理のたびに再試行) | 1. ソースコード上で実装済み(`process_entitlement_grant()`内で毎回再解決を試みる) |
| §5.5 管理画面(未解決entitlement一覧・再解決ボタン・却下・監査ログ) | 7. 未対応(別PRで対応予定) |
| §5.6 revoke先行時の挙動(`entitlement_pending_revocations`) | 実装済み(既存のP0-2実装を維持、本PRでの変更なし) |
| 並行実行時の受入条件(§5.7) | 6. 未確認(コードレビューのみ、DB統合テスト未実施) |

**実装内容の要約**: `entitlements`テーブルへ`application_claim_token`/`application_lease_expires_at`/`reversal_claim_token`/`reversal_lease_expires_at`列を追加し、PR1/PR2と同じ設計方針(`claim_*`関数でSELECT ... FOR UPDATE+fencing tokenによる原子的claim、`process_*`関数でclaim・副作用・状態更新を単一トランザクションに統合)を適用した。

- `process_entitlement_grant(p_entitlement_row_id)`: 行ロックを取得した上で、`user_id`が未解決なら`common_user_id`から再解決を試み(§5.5)、解決できれば`entitlements.user_id`を更新してから`claim_entitlement_application()`をネスト呼び出しし、claim成功時のみ残高加算+`application_status='applied'`更新を行う。全体が単一トランザクションのため、途中でプロセスが落ちても二重付与は起こらない。
- `process_entitlement_revocation(p_entitlement_row_id)`: 同様に`claim_entitlement_reversal()`をネスト呼び出しし、実際に残高が反映されていた場合(`application_status='applied'`)のみ残高減算+`reversal_status='reversed'`更新を行う。既存の「statusの更新順序に関わらず実際の反映状況で判定する」挙動は維持した。
- `src/lib/entitlements.ts`の`handleEntitlementGranted()`/`handleEntitlementRevoked()`は、上記2つのPostgres関数を呼び出す形に簡略化した。`BALANCE_ENTITLEMENT_COLUMNS`・`adjustUserBalance`の直接呼び出しはSQL側へ移設したため削除した。

**未対応の残存事項**: §5.5後半が求める管理画面(未解決entitlement一覧・common_user_id/entitlement_id/source_system_key/entitlement_type/受信日時の表示・再解決ボタン・却下/保留・監査ログ)は本PRのスコープに含めていない。`process_entitlement_grant()`はentitlement受信イベントの再送時にのみ`user_id`再解決を試みるため、送信元からの再送が来ない限り、未解決のまま放置されるentitlementが残り得る。管理画面からの手動再解決トリガーは別PRで対応する。

## Phase A-3: Stripe inbox原子的claim

### PR4: fix: atomically claim Stripe webhook inbox events

| 項目 | 状況 |
|---|---|
| §6.2 原子的claim(`claim_stripe_webhook_event`/`mark_stripe_webhook_succeeded`/`mark_stripe_webhook_failed`、claim_tokenによるfencing) | 1. ソースコード上で実装済み |
| §6.2 unique違反がHTTP 500にならないこと(claim関数内で`ON CONFLICT DO NOTHING`+`FOR UPDATE`により、呼び出し元へunique制約違反が伝播しない設計) | 1. ソースコード上で実装済み |
| 並行実行時の受入条件(§6.3、同一event 10並列実行で1回だけ処理等) | 6. 未確認(コードレビューのみ、DB統合テスト未実施) |

**実装内容の要約**: PR1/PR3と同じ設計方針(`SELECT ... FOR UPDATE`+claim_tokenによるfencing)を`stripe_webhook_events`へ適用した。`claim_stripe_webhook_event()`は指示書§6.2の戻り値仕様(`new`/`duplicate`/`in_progress`/`retryable`/`dead`)をそのまま実装し、`claim_token`は呼び出し側(TypeScript、`crypto.randomUUID()`)が生成して渡す設計とした(指示書§6.2の関数シグネチャに明記の通り)。`src/app/api/stripe/webhook/route.ts`の既存inbox実装(`existingInboxEvent`のSELECT→`decideStripeInboxAction()`による判定→INSERT/UPDATE、という複数DB往復)を、単一のRPC呼び出し+`mark_stripe_webhook_succeeded()`/`mark_stripe_webhook_failed()`へ置き換えた。モジュール化(PR12)時点で抽出していた純粋関数`src/modules/commerce/domain/stripe-inbox.ts`(`decideStripeInboxAction()`)は、判定ロジックがSQL側へ完全移設されたため削除した。

**未対応の残存事項**: §7(HMAC署名v2)は別PRで対応する。

## Phase A-3: HMAC署名v2

### PR5: feat: support HMAC signature v2 alongside v1

| 項目 | 状況 |
|---|---|
| §7.1 既存v1署名の維持(既存接続を破壊しない) | 1. ソースコード上で実装済み |
| §7.2 v2署名(key_id/timestamp/nonce/event_version/idempotency_key/raw_bodyを署名対象に含める、`X-SenNoKuni-Signature-Version: 2`) | 1. ソースコード上で実装済み |
| §7.3 v1/v2併存、システム単位の許可バージョン設定(`v1_disabled_at`)、v1利用ログ記録 | 1. ソースコード上で実装済み |
| §7.3 新規連携はv2必須 | 実装済み(運用上の取り決め。接続開始時に`v1_disabled_at`をnow()に設定することで実現。DB制約では強制しない) |
| §7.3 v1停止日時を決定 | 7. 未対応(運用判断。列は用意済みだが、実際の停止日時決定・管理画面からの設定UIは別途必要) |
| §7.4 必須検証(nonce/Idempotency-Key/event_version/key_id/raw_body変更で署名不一致) | 2. unit test確認済み(`sen-no-kuni-hub-signature.test.ts`、canonical string構築の純粋関数レベルで検証) |
| §7.4 timestamp期限切れ・nonce再利用 | 6. 未確認(既存v1と同じくDB/時刻依存のためコードレビューのみ、DB統合テスト未実施) |

**実装内容の要約**: `src/modules/integrations/domain/sen-no-kuni-hub-signature.ts`(新規)にHMAC署名のバージョン判定・v2 canonical string構築・v1停止判定を純粋関数として実装し、`sen-no-kuni-hub-signature.test.ts`でunit testを追加した(§7.4の必須検証のうち、nonce/Idempotency-Key/event_version/key_id/raw_bodyの各要素を変更するとcanonical stringが変化することを確認)。`src/lib/sen-no-kuni-hub-auth.ts`の`verifySenNoKuniHubRequest()`は`X-SenNoKuni-Signature-Version`ヘッダー(省略時はv1として扱う)で分岐し、v2の場合は`X-Event-Version`/`Idempotency-Key`ヘッダーも署名対象に含める。`sen_no_kuni_hub_settings`へ`v1_disabled_at`/`v1_last_used_at`/`v1_usage_count`列を追加し、システム単位でv1署名の受付終了日時を設定できるようにした(未設定なら無期限にv1を許可、既存接続を破壊しない)。v1署名でのリクエスト成功時は`record_sen_no_kuni_hub_v1_usage()`(単一UPDATE文による原子的インクリメント)でベストエフォートに利用ログを記録する。

**未対応の残存事項**: v1停止日時を実際に決定し設定する運用判断、および管理画面からの`v1_disabled_at`設定UIは本PRのスコープに含めていない(列・関数のみ用意)。

## Phase A-4: ガチャ・国取り安全化

### PR6: fix: make gacha draws transactionally safe

| 項目 | 状況 |
|---|---|
| §8.3 単一Postgres関数`execute_gacha_draw()`への統合(日次上限予約・ガチャ券消費・武将count・ログ・国家貢献ポイント・国制覇・実績・地方ボーナス) | 1. ソースコード上で実装済み |
| §8.3 必須制約(`unique(user_id, warlord_id)`/`unique(user_id, achievement_type)`/`unique(user_id, province_id)`/`unique(request_id)`) | 1. ソースコード上で実装済み(前3つは既存制約を再利用、`achievement_type`のみ本PRで新設、`request_id`も新設) |
| §8.5 Asia/Tokyo基準の日付境界(`getTokyoBusinessDate()`) | 2. unit test確認済み(`draw-limit.test.ts`) |
| §8.4 失敗時に副作用が残らないこと(ガチャ券・武将・ログ・ポイント・国制覇) | 1. ソースコード上で実装済み(単一トランザクションのため、途中で例外が発生すれば全体がロールバックされる。コードレビュー上の判断) |
| §8.5 並行実行時の受入条件(20並列実行で上限超過なし・ガチャ券1枚で2回引けない等) | 6. 未確認(コードレビューのみ、DB統合テスト未実施) |

**実装内容の要約**: 国・スロット・武将の決定(排出率tier参照、DB設定に依存する読み取り専用処理)は`src/lib/gacha.ts`(TS)で従来通り行い、その決定結果を反映する書き込み側(日次上限予約・ガチャ券消費・`user_warlords`更新・`gacha_logs`追加・国家貢献ポイント加算・国制覇判定・実績記録・地方ボーナス付与)を単一のPostgres関数`execute_gacha_draw()`(マイグレーション`20260808000006`)へ統合した。日次上限は新設の`gacha_daily_usage`テーブル(`unique(user_id, business_date, draw_type)`)に対する`SELECT ... FOR UPDATE`で原子的に確認・予約し、行ロックを保持したまま関数全体を実行することで、同一ユーザーの並行リクエストを直列化する。`user_warlords`の被り枚数更新は`INSERT ... ON CONFLICT ... DO UPDATE`+`RETURNING (xmax = 0)`(新規獲得判定の標準的なPostgresイディオム)で原子化し、`achievements`は新設の`unique(user_id, achievement_type)`制約+`ON CONFLICT DO NOTHING`で重複防止した。`request_id`(呼び出しごとにTS側で`crypto.randomUUID()`生成)による冪等リプレイにも対応し、同一`request_id`での再呼び出しは副作用を再実行せず前回の結果をそのまま返す。動画演出の選定・記録のみ、既存方針(失敗してもガチャ自体を失敗させない)を維持するため、コミット後のベストエフォート処理として残した。

日次上限の判定基準を、旧実装のサーバーローカル日付境界から、`getTokyoBusinessDate()`(純粋関数、`draw-limit.test.ts`でunit test済み)によるAsia/Tokyo基準の日付境界に変更した(§8.5)。

**クリーンアップ**: ロジックがSQL側へ完全移設されたため、`src/modules/gacha/domain/rarity.ts`(`calcContributionPoints`)・`src/modules/conquest/domain/conquest-policy.ts`(`isConquestSatisfied`)とそれぞれのテストを削除した(モジュール化(PR3/PR4)で抽出した純粋関数だが、本PRで唯一の呼び出し元だった`gacha.ts`から呼ばれなくなったため)。

**未対応の残存事項・既知の制約**:
- 選出可能国一覧(`getEligibleProvinces`)の取得は`execute_gacha_draw()`のトランザクション外(TS側の事前読み取り)のため、同一国を狙う並行リクエストが極めて僅かな時間差で選出結果に影響し得る(TOCTOU)。ただし選出国は`user_provinces.is_conquered=true`の国を除外するため、一度制圧された国は以降選出されなくなり実害は限定的(既存実装から変更していない挙動)。
- `execute_gacha_draw()`の`xmax = 0`による新規獲得判定は標準的なPostgresイディオムだが、DB統合テスト環境が無いため実行結果としての確認はできていない。
- `p_business_date`はPostgreSQLの`date`型パラメータとしてISO 8601文字列("YYYY-MM-DD")をSupabase経由で渡す設計だが、実際のPostgREST/Supabase-js経由での型変換の実地確認はできていない。
- `achievements`への`unique(user_id, achievement_type)`制約追加は、既存データに重複行が無いことを前提とする。本番適用前に`select user_id, achievement_type, count(*) from achievements group by 1, 2 having count(*) > 1;`で重複が無いことを確認すること(重複があればマイグレーション適用が失敗する)。

## §9: 管理画面権限修正

### PR7: fix: require manager role for integration-recovery admin actions

| 項目 | 状況 |
|---|---|
| 4つのAPI(`cleanup-nonces`/`retry-agent-assignments`/`merge-conflicts/[id]/resolve`/`unresolved-agent-assignments/[id]/dismiss`)を`requireManagerRole()`でmanager限定にする | 1. ソースコード上で実装済み |
| 記録を単純削除せず`resolved_at`/`resolved_by`/`resolution_note`を保持する(resolve/dismissの2つ) | 1. ソースコード上で実装済み |
| 監査ログ(actor/action/target ID/before/after/reason/executed_at) | 1. ソースコード上で実装済み(`executed_at`は`admin_audit_logs.created_at`の既存自動記録、`reason`は`resolutionNote`として`logAdminAction()`の`details`引数に記録) |

**実装内容の要約**: `supabase/migrations/20260808000007_integration_recovery_soft_resolve.sql`で`common_user_merge_conflicts`・`unresolved_agent_assignments`へ`resolved_at`/`resolved_by`/`resolution_note`列を追加した。4つのAPIルートすべてに`getAdminSession()`(既存)に加えて`requireManagerRole()`のチェックを追加し、operatorロールでは403を返すようにした。`merge-conflicts/[id]/resolve`・`unresolved-agent-assignments/[id]/dismiss`は、対象行をDELETEする実装から、`resolved_at`/`resolved_by`/`resolution_note`を設定するUPDATEに変更し、`logAdminAction()`の`before`/`after`スナップショットに更新前後の行データを記録するようにした(任意で`resolutionNote`をリクエストボディから受け取る)。一覧取得API(`merge-conflicts`・`unresolved-agent-assignments`のGET)は`resolved_at is null`で絞り込むよう変更し、既に解決・却下済みの行が管理画面に再表示されないようにした(既存UI`/admin/integration-recovery`の見た目・挙動は変更なし)。

**未対応の残存事項**: `resolutionNote`の入力UIは管理画面(`/admin/integration-recovery`)には追加していない(APIはボディで受け取れるが、現状のUIは送信しないため常にnullで記録される)。将来的にUIから理由入力できるようにする余地があるが、本PRのスコープ(権限修正+ソフト削除化)には含めない。

## §10: 未同期ユーザーイベント保持

### PR8: fix: persist unresolved events for not-yet-synced users

| 項目 | 状況 |
|---|---|
| §10.1 対象ユーザーが見つからない場合もunresolved_agent_assignmentsへ保存(reason=`user_not_found`) | 1. ソースコード上で実装済み |
| §10.2 統合元ユーザー未同期の場合もunresolved_common_user_mergesへ保存 | 1. ソースコード上で実装済み |
| §10.2 ユーザー登録またはcommon_user_id同期後に再処理できること | 1. ソースコード上で実装済み(管理画面からの手動再解決トリガー、Cron等のバックグラウンドジョブ基盤が無いため既存の`retry-agent-assignments`と同じ方式) |

**実装内容の要約**:
- `src/lib/agency-events.ts`の`handleAssignedAgentUpdated()`が、`common_user_id`に対応するローカルユーザーが見つからない場合に何もせず`return`していた箇所を、`unresolved_agent_assignments`へ`reason='user_not_found'`で保存するよう変更した(`unresolved_agent_assignments.reason`のcheck制約に`user_not_found`を追加)。既存の`retry-agent-assignments`(PR7でmanager限定化済み)がそのまま再処理経路として機能する。
- `handleCommonUserMerged()`が、統合元(source)の`common_user_id`に対応するローカルユーザーが見つからない場合に「無関係なイベント」として`return`していた箇所を、新設の`unresolved_common_user_merges`テーブル(`reason='source_user_not_found'`、`status`/`attempt_count`/`last_error`/`resolved_at`列を持つ)へ保存するよう変更した。
- 新規管理API `GET /api/admin/integrations/sen-no-kuni-hub/unresolved-common-user-merges`(一覧)・`POST /api/admin/integrations/sen-no-kuni-hub/retry-common-user-merges`(全件再解決、`requireManagerRole()`で保護)を追加し、`handleCommonUserMerged()`を再度呼び出すことで再処理する(成功時は`handleCommonUserMerged()`内部で`status='resolved'`へ更新される)。
- `/admin/integration-recovery`画面へ「未解決のcommon_user統合イベント」セクションを追加し、既存の「未解決の担当代理店割当」セクションと同じUIパターン(一覧表示+全件再試行ボタン)で運用できるようにした。

**設計判断**: 新設ルート(`retry-common-user-merges`)は既存4ルートの§9の対象リストには含まれていないが、同じ「連携基盤の再解決」カテゴリの操作であるため、一貫性のため`requireManagerRole()`を最初から適用した(§9で既存ルートをmanager限定化した直後に、新設ルートだけoperatorアクセス可能にする方が不整合と判断)。

## Phase A-1(残): 購入イベント外部副作用のoutbox化

### PR9: fix: move external purchase side effects to outbox

| 項目 | 状況 |
|---|---|
| §4.3.3 外部副作用(紹介confirm)の送信前outbox登録・結果追跡 | 1. ソースコード上で実装済み |
| §4.3.3 外部副作用(区画購入LINE通知)の送信前outbox登録・結果追跡 | 1. ソースコード上で実装済み |
| 管理画面からの再送(手動drain) | 1. ソースコード上で実装済み |
| 並行実行時の受入条件(同一購入への再実行で重複送信が起きないこと) | 6. 未確認(コードレビューのみ、DB統合テスト未実施。`enqueueOutboxEvent()`のunique制約+`23505`検知による冪等insertはコードレビュー上健全と判断) |

**実装内容の要約**: `confirmReferral()`(`src/lib/common-user-hub.ts`)・`notifyPlotPurchase()`(`src/lib/castle-notifications.ts`)は、いずれも失敗時に例外を投げず`null`/ログのみで処理を終える「fail-open」設計であるため、既存の`runStep()`によるステップclaim機構が常に`completed`と記録してしまい、実際の外部送信が失敗しても記録に残らず再送手段も無かった。両関数の戻り値を`Promise<void>`から`Promise<boolean>`(実際に送信できたか)へ変更し(既存の唯一の他呼び出し元である`src/lib/passport.ts`は戻り値を使用しないため非破壊的な変更)、新設の`src/lib/integration-outbox.ts`(`enqueueOutboxEvent`/`markOutboxSent`/`markOutboxFailed`/`listPendingOrFailedOutboxEvents`、`integration_outbox_events`・`notification_outbox_events`の2テーブルを共通関数でパラメータ化)経由で、送信前にoutboxへ記録→送信試行→結果を反映、という流れに変更した。`src/lib/purchase-grants.ts`の`confirmReferralForPurchase()`・新設`notifyPlotPurchaseViaOutbox()`がこの流れを実装する。管理画面からの手動再送用に`POST /api/admin/integration-outbox/drain`(`requireManagerRole()`で保護)・一覧取得用`GET /api/admin/integration-outbox`を新設し、`/admin/integration-recovery`画面に一覧表示+全件再送ボタンのセクションを追加した。

**設計判断**: 全体統合対応PR5で用意されていた`src/lib/integration-outbox.ts`(`source_type`/`source_id`を持たず`integration_outbox_events`専用、冪等性のための一意キーが無い)は、grepで確認した通り本PR以前は呼び出し元が存在せず未使用だったため、本PRの要件(2テーブル共用・`source_type`/`source_id`による冪等enqueue)に合わせて全面的に置き換えた。`integration_outbox_events`への`source_type`/`source_id`列追加(NOT NULL)は、既存行が無い前提のマイグレーションであるため、本番適用前に`select count(*) from integration_outbox_events;`で0件であることを確認する必要がある旨をマイグレーションのコメントに明記した。

**未対応の残存事項**: `notifyPlotPurchaseViaOutbox()`は、LINE未連携・LINE設定未登録等の「送信不要な対象外ケース」(`notifyPlotPurchase()`が`false`を返す場合)も`sent`として記録する設計とした(再送しても意味が無いため)。これにより、outbox一覧上は「実際に送信を試みて失敗した」ケースと「そもそも送信対象外だった」ケースが区別できない(いずれも最終的に`sent`または`failed`のいずれかに収束するのみで、後者を示す専用ステータスは無い)。運用上問題になる場合は、専用ステータス(例: `skipped`)の追加を別途検討する。
