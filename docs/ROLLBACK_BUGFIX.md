# 千ノ国パスポート モジュール化後バグ修正 ロールバック手順

`SEN_NO_KUNI_PASSPORT_POST_MODULARIZATION_BUGFIX_INSTRUCTIONS.md` §18の提出物。

## ロールバック条件(指示書§18より)

以下を検知した場合、該当PRをロールバックする。

- 石高・ガチャ券の二重付与/欠落
- entitlement二重付与・二重取消
- Stripe購入未完了
- ガチャ結果欠落・国制覇結果変化
- 紹介者上書き・common_user_id消失
- 代理店SSO停止・既存API認証失敗・HMAC v1接続停止
- 区画二重所有・代理店報酬二重計上
- DBマイグレーション失敗・既存テスト回帰・build失敗

## ロールバック前の確認事項(必須)

処理中レコードを確認してから対応すること。処理中データを放置したままコードだけ戻さない。

```sql
select id, status, grant_status from purchases where status = 'processing';
select id, status, grant_status from purchases where grant_status in ('processing', 'retrying', 'failed');
select id, purchase_id, step_key, status, claim_token, lease_expires_at from purchase_grant_steps where status = 'processing';
select id, application_status from entitlements where application_status = 'applying';
select id, reversal_status from entitlements where reversal_status = 'reversing';
select id, status from integration_inbox_events where status = 'processing';
select id, status from stripe_webhook_events where status = 'processing';
```

## PR1: fix: atomically claim purchase grant steps

### ロールバック手順

1. 該当コミットを`git revert`する(squashマージのため1コミットで完結)。
2. `supabase/migrations/20260808000001_purchase_grant_step_atomic_claim.sql`で追加した3つのPostgres関数(`claim_purchase_grant_step`/`mark_purchase_grant_step_completed`/`mark_purchase_grant_step_failed`)・列(`claim_token`/`lease_expires_at`)・check制約の変更は、`revert`だけではDB側に残る(マイグレーションのdown処理は本リポジトリの既存慣習として用意していない)。DB側を完全に戻す場合は、以下のロールバック用SQLを別途適用する:

```sql
drop function if exists mark_purchase_grant_step_failed(uuid, uuid, text);
drop function if exists mark_purchase_grant_step_completed(uuid, uuid);
drop function if exists claim_purchase_grant_step(uuid, text, int, int);

alter table purchase_grant_steps drop constraint purchase_grant_steps_status_check;
alter table purchase_grant_steps add constraint purchase_grant_steps_status_check
  check (status in ('pending', 'completed', 'failed'));

alter table purchase_grant_steps
  drop column if exists claim_token,
  drop column if exists lease_expires_at;
```

3. ロールバック実行前に、`purchase_grant_steps.status = 'processing'`の行が無いことを確認する(処理中に切り戻すと、そのステップは`processing`のまま宙に浮き、旧コードのrunStep()が`existing?.status === "completed"`のチェックのみで再実行してしまう可能性がある)。

### 影響範囲

本PRは`purchase_grant_steps`テーブルの列追加・関数追加のみで、既存の`purchases`テーブル・`users`テーブル等の既存カラムには影響しない。ロールバックしても既存の購入データ・残高データは変更されない。

**注意**: PR2(`apply_purchase_balance_grant`/`record_purchase_agent_sale`)はPR1の`claim_purchase_grant_step()`に依存しているため、PR1をロールバックする場合は先にPR2をロールバックすること。

## PR2: fix: make balance grants transactional and idempotent

### ロールバック手順

1. 該当コミットを`git revert`する。
2. `apply_purchase_balance_grant()`/`record_purchase_agent_sale()`をDB側から削除する場合は以下を適用する:

```sql
drop function if exists record_purchase_agent_sale(uuid, uuid, text, int);
drop function if exists apply_purchase_balance_grant(uuid, uuid, text, int);
```

3. ロールバック実行前に、`purchase_grant_steps`の`step_key in ('balance_granted', 'agent_sale_recorded')`かつ`status = 'processing'`の行が無いことを確認する。処理中に切り戻すと、旧コード(`grantPurchase()`/`recordAgentSaleIfReferred()`、PR1以前の`runStep()`パターン)には戻らないため、そのステップは永久に`processing`のまま残り得る。ロールバック後に必要であれば手動でステップ行を`pending`へ戻すか削除し、`runPurchaseGrant()`の再実行で処理させること。

### 影響範囲

本PRは新規Postgres関数の追加とTypeScript側の呼び出し方変更のみで、既存カラム・既存データには影響しない。`agent_sales.purchase_id`の部分unique indexは既存(PR1以前、P0-2時点)のまま変更していない。

## PR3: fix: atomically apply and reverse entitlements

### ロールバック手順

1. 該当コミットを`git revert`する。
2. `process_entitlement_grant()`/`process_entitlement_revocation()`/`claim_entitlement_application()`/`claim_entitlement_reversal()`をDB側から削除し、列・check制約を戻す場合は以下を適用する:

```sql
drop function if exists process_entitlement_revocation(uuid);
drop function if exists process_entitlement_grant(uuid);
drop function if exists claim_entitlement_reversal(uuid, int, int);
drop function if exists claim_entitlement_application(uuid, int, int);

alter table entitlements drop constraint entitlements_reversal_status_check;
alter table entitlements add constraint entitlements_reversal_status_check
  check (reversal_status in ('not_reversed', 'reversed', 'failed'));

alter table entitlements drop constraint entitlements_application_status_check;
alter table entitlements add constraint entitlements_application_status_check
  check (application_status in ('not_applied', 'applied', 'failed'));

alter table entitlements
  drop column if exists application_claim_token,
  drop column if exists application_lease_expires_at,
  drop column if exists reversal_claim_token,
  drop column if exists reversal_lease_expires_at;
```

3. ロールバック実行前に、`entitlements.application_status = 'applying'`または`entitlements.reversal_status = 'reversing'`の行が無いことを確認する。処理中に切り戻すと、旧コード(`handleEntitlementGranted()`/`handleEntitlementRevoked()`のPR3以前の実装)はこれらの中間状態を認識できないため、該当entitlementは`applying`/`reversing`のまま宙に浮き得る。ロールバック後に必要であれば手動で`application_status`/`reversal_status`を`not_applied`/`not_reversed`へ戻し、再送またはPR3以前の処理経路で再処理させること。

### 影響範囲

本PRは`entitlements`テーブルへの列追加・関数追加、および`src/lib/entitlements.ts`内の残高操作ロジックのSQL側への移設のみで、既存の`entitlements`テーブルの既存カラム・`entitlement_pending_revocations`テーブル・`users`テーブルの既存データには影響しない。ロールバックしても既存の権利台帳データ・残高データは変更されない。既存のP0-2実装(revoke先行時の保留取消の仕組み)はPR3で変更していないため、ロールバックの影響を受けない。

## PR4: fix: atomically claim Stripe webhook inbox events

### ロールバック手順

1. 該当コミットを`git revert`する。ロールバックすると`src/app/api/stripe/webhook/route.ts`は本PR以前の実装(`decideStripeInboxAction()`ベース)に戻るため、`src/modules/commerce/domain/stripe-inbox.ts`・`stripe-inbox.test.ts`も`git revert`により復元される。
2. `claim_stripe_webhook_event()`/`mark_stripe_webhook_succeeded()`/`mark_stripe_webhook_failed()`をDB側から削除し、列・check制約を戻す場合は以下を適用する:

```sql
drop function if exists mark_stripe_webhook_failed(uuid, uuid, text);
drop function if exists mark_stripe_webhook_succeeded(uuid, uuid);
drop function if exists claim_stripe_webhook_event(text, text, jsonb, uuid, int, int);

alter table stripe_webhook_events drop constraint stripe_webhook_events_status_check;
alter table stripe_webhook_events add constraint stripe_webhook_events_status_check
  check (status in ('pending', 'processing', 'succeeded', 'failed'));

alter table stripe_webhook_events
  drop column if exists claim_token,
  drop column if exists claimed_at,
  drop column if exists lease_expires_at;
```

3. ロールバック実行前に、`stripe_webhook_events.status = 'processing'`の行が無いことを確認する。処理中に切り戻すと、旧コード(`decideStripeInboxAction()`)はこの行を「再処理対象」と判定して再実行してしまう可能性がある(本PR以前と同じ挙動に戻るだけで新たな問題ではないが、切り戻しのタイミングによっては同一Stripeイベントが二重に権利付与処理へ進みうる)。

### 影響範囲

本PRは`stripe_webhook_events`テーブルへの列追加・関数追加と、`src/app/api/stripe/webhook/route.ts`内のinbox判定ロジックの呼び出し方変更のみで、既存カラム・既存の`purchases`テーブル・`users`テーブルのデータには影響しない。ロールバックしても既存のStripe決済履歴・残高データは変更されない。

## PR5: feat: support HMAC signature v2 alongside v1

### ロールバック手順

1. 該当コミットを`git revert`する。ロールバックすると`src/lib/sen-no-kuni-hub-auth.ts`は本PR以前の実装(v1署名のみ)に戻り、`src/modules/integrations/domain/sen-no-kuni-hub-signature.ts`・`sen-no-kuni-hub-signature.test.ts`も削除される。
2. `record_sen_no_kuni_hub_v1_usage()`をDB側から削除し、列を戻す場合は以下を適用する:

```sql
drop function if exists record_sen_no_kuni_hub_v1_usage(text);

alter table sen_no_kuni_hub_settings
  drop column if exists v1_disabled_at,
  drop column if exists v1_last_used_at,
  drop column if exists v1_usage_count;
```

3. ロールバック前に、v2署名で接続している外部システムが無いことを確認する。v2署名のみを使うよう案内済みの連携先が存在する場合、ロールバックするとその接続先からのリクエストは全て`invalid_signature_version`または署名不一致で拒否されるようになる(v1署名へ戻すよう連携先に依頼するか、ロールバックを見送る)。

### 影響範囲

本PRは`sen_no_kuni_hub_settings`テーブルへの列追加・関数追加と、`src/lib/sen-no-kuni-hub-auth.ts`内の署名検証ロジックの変更のみで、既存のv1署名接続には影響しない(`v1_disabled_at`が未設定の既存行はロールバック前後を問わずv1署名を受け付け続ける)。既存の`sen_no_kuni_hub_used_nonces`・`integration_inbox_events`等のデータには影響しない。

## PR6: fix: make gacha draws transactionally safe

### ロールバック手順

1. 該当コミットを`git revert`する。ロールバックすると`src/lib/gacha.ts`は本PR以前の実装(個別のread-modify-write処理群)に戻り、`src/modules/gacha/domain/rarity.ts`/`src/modules/conquest/domain/conquest-policy.ts`とそれぞれのテストも復元される。
2. `execute_gacha_draw()`をDB側から削除し、列・制約を戻す場合は以下を適用する:

```sql
drop function if exists execute_gacha_draw(uuid, text, date, int, uuid, uuid, int, uuid);

alter table achievements drop constraint if exists achievements_user_id_achievement_type_key;

drop index if exists gacha_logs_request_id_key;

alter table gacha_logs
  drop column if exists request_id,
  drop column if exists is_new_card,
  drop column if exists province_conquered,
  drop column if exists region_completed,
  drop column if exists region_completion_bonus,
  drop column if exists contribution_points_earned;

drop table if exists gacha_daily_usage;
```

3. ロールバック実行前に、進行中のガチャ抽選リクエストが無いことを確認する(具体的な判定手段は無いため、可能であればメンテナンスモード等で新規リクエストを止めてから実施する)。`execute_gacha_draw()`は単一トランザクションのため`processing`のような中間状態は残らないが、ロールバック直後に旧コード(read-modify-write処理群)へ切り替わることで、旧実装が抱えていた既知のレース(§8.2、日次上限・武将count・実績重複等)が再発する点に注意する。
4. `achievements_user_id_achievement_type_key`制約を削除する前に、この制約が実際に重複行の発生を防いでいた形跡(制約違反エラーのログ等)が無いか確認しておくと、ロールバック後の運用判断の参考になる。

### 影響範囲

本PRは`gacha_daily_usage`テーブルの新設、`gacha_logs`/`achievements`テーブルへの列・制約追加、および`src/lib/gacha.ts`の書き込みロジックのSQL側への移設のみで、既存の`user_warlords`・`user_provinces`・`gacha_logs`・`achievements`・`users`テーブルの既存カラム・既存データには影響しない。ロールバックしても既存の武将所持数・国制覇状況・実績・残高データは変更されない。

**注意**: `achievements_user_id_achievement_type_key`制約はロールバック後もDB上に残しておくこと自体は害が無い(旧コードのSELECT→INSERTパターンと併存しても、正常系では制約に抵触しない)。ロールバックの一環として制約自体を削除する必要は本来無いが、旧実装の挙動を完全に復元したい場合の手順として上記に含めた。

## PR7: fix: require manager role for integration-recovery admin actions

### ロールバック手順

1. 該当コミットを`git revert`する。ロールバックすると4つのAPIルートは`requireManagerRole()`チェック無しの実装に戻り、`merge-conflicts/[id]/resolve`・`unresolved-agent-assignments/[id]/dismiss`はDELETEベースの実装に戻る。
2. `resolved_at`/`resolved_by`/`resolution_note`列を戻す場合は以下を適用する:

```sql
alter table common_user_merge_conflicts
  drop column if exists resolved_at,
  drop column if exists resolved_by,
  drop column if exists resolution_note;

alter table unresolved_agent_assignments
  drop column if exists resolved_at,
  drop column if exists resolved_by,
  drop column if exists resolution_note;
```

3. ロールバック前に、本PR以降にresolve/dismissされた行(`resolved_at`が設定されている行)が無いことを確認する。列を削除すると、旧コード(DELETEベース)へ戻った直後にそれらの行が「未解決」として管理画面に再表示されてしまう(データが失われるわけではないが、既に対応済みの案件が再度目に入ることになる)。気になる場合は、列を削除する前に該当行を手動でDELETEしておく。

### 影響範囲

本PRは`common_user_merge_conflicts`・`unresolved_agent_assignments`テーブルへの列追加と、4つのAPIルートの認可チェック・DB操作方法の変更のみで、既存カラム・既存データには影響しない。ロールバックしても解決済み・未解決を問わず既存の行データは変更されない(列を削除した場合のみ、上記2の通り「解決済み」の情報が失われる)。

## PR8: fix: persist unresolved events for not-yet-synced users

### ロールバック手順

1. 該当コミットを`git revert`する。ロールバックすると`handleAssignedAgentUpdated()`/`handleCommonUserMerged()`は本PR以前の実装(対象ユーザー未検出時に無条件で`return`し、イベントを破棄する)に戻り、新規の2つのAPIルート(`unresolved-common-user-merges`・`retry-common-user-merges`)と管理画面の「未解決のcommon_user統合イベント」セクションも削除される。
2. `unresolved_common_user_merges`テーブル・`unresolved_agent_assignments.reason`のcheck制約変更を戻す場合は以下を適用する:

```sql
drop table if exists unresolved_common_user_merges;

alter table unresolved_agent_assignments drop constraint unresolved_agent_assignments_reason_check;
alter table unresolved_agent_assignments add constraint unresolved_agent_assignments_reason_check
  check (reason in ('agent_code_undetermined', 'agent_not_found'));
```

3. `unresolved_agent_assignments.reason`のcheck制約を戻す前に、`reason = 'user_not_found'`の行が存在しないことを確認する(存在する場合、制約の再作成が失敗する)。存在する場合は、該当行を削除するか、他のreason値に変更してから制約を戻すこと。
4. `unresolved_common_user_merges`テーブルをDROPすると、その時点で保存されていた未解決イベントの記録(再処理に必要なpayload含む)が完全に失われる。ロールバック後もこれらのイベントを再処理したい場合は、DROPする前にテーブルの内容をバックアップしておくこと。

### 影響範囲

本PRは`unresolved_agent_assignments`のcheck制約変更、`unresolved_common_user_merges`テーブルの新設、および`src/lib/agency-events.ts`内の「対象ユーザー未検出時の挙動」の変更(イベント破棄→保存)のみで、既存の`users`・`unresolved_agent_assignments`・`common_user_merge_conflicts`テーブルの既存データには影響しない。ロールバックしても既存の代理店紐付け・共通ユーザー統合データは変更されない。
