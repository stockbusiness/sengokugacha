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
