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
