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
