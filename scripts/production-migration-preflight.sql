-- 千ノ国パスポート Phase C-0 PR4(§11 既存データ相当マイグレーション試験)。
--
-- 本番相当DBへこのブランチのマイグレーションを適用する前に、手動で(読み取り専用の
-- DBロール等で)実行するための事前確認スクリプト。以下のunique制約の対象カラムの
-- 組み合わせで、適用前の実データに重複が無いことを確認する。
--   - achievements: (user_id, achievement_type)
--   - purchase_grant_steps: (purchase_id, step_key)
--   - entitlements: (source_system_key, entitlement_id)
--   - integration_inbox_events: (source_system_key, event_id)
--   - stripe_webhook_events: stripe_event_id
--
-- 【安全性】本スクリプトはSELECTのみで構成され、INSERT/UPDATE/DELETE/ALTER/DROPを
-- 一切含まない。tests/migrations/duplicate-checks.sqlと同じクエリを、本番DBへ手動で
-- 直接実行することを想定して独立したファイルにしたもの(supabase CLI・テスト実行環境
-- 一式を用意できない運用担当者でも、psqlだけで事前確認できるようにする)。
-- 重複が見つかった場合でも、このスクリプトが自動で削除・統合することは絶対に行わない
-- (指示書§5.2/§11と同じ方針)。重複が1件でも見つかった場合は、件数・原因・正とする行の
-- 決定方法・統合方針・ロールバック方法・既存機能への影響を報告してから対応すること。
--
-- 【前提】対象の5テーブルはいずれもこのPRより前の段階で作成済みであり、本番DBに
-- 既に存在している前提で書かれている(存在しない場合はrelation does not existで
-- 即座にエラー終了するため、その場合はまずテーブル作成マイグレーションの適用状況を
-- 確認すること)。
--
-- 【使い方】 psql "$PRODUCTION_DATABASE_URL" -f scripts/production-migration-preflight.sql

\echo '=== 千ノ国パスポート 本番マイグレーション事前確認(読み取り専用) ==='

\echo '--- achievements: (user_id, achievement_type) 重複チェック ---'
select user_id, achievement_type, count(*)
from achievements
group by user_id, achievement_type
having count(*) > 1;

\echo '--- purchase_grant_steps: (purchase_id, step_key) 重複チェック ---'
select purchase_id, step_key, count(*)
from purchase_grant_steps
group by purchase_id, step_key
having count(*) > 1;

\echo '--- entitlements: (source_system_key, entitlement_id) 重複チェック ---'
select source_system_key, entitlement_id, count(*)
from entitlements
group by source_system_key, entitlement_id
having count(*) > 1;

\echo '--- integration_inbox_events: (source_system_key, event_id) 重複チェック ---'
select source_system_key, event_id, count(*)
from integration_inbox_events
group by source_system_key, event_id
having count(*) > 1;

\echo '--- stripe_webhook_events: stripe_event_id 重複チェック ---'
select stripe_event_id, count(*)
from stripe_webhook_events
group by stripe_event_id
having count(*) > 1;

-- 千ノ国パスポート Phase C-1(§4 Migration preflight追加確認)。以下も同じ方針
-- (読み取り専用・SELECTのみ・重複/異常を自動で修正しない)で追加する。

\echo '--- orphan FK: purchase_grant_steps.purchase_id が存在しないpurchasesを指していないか ---'
-- purchase_grant_steps_purchase_id_fkey等は全てvalidated FKとして宣言済みのため
-- 通常は0件のはず。COPY等のFK検証バイパス経路の有無を確認する目的の安全網。
select s.id, s.purchase_id
from purchase_grant_steps s
where not exists (select 1 from purchases p where p.id = s.purchase_id);

\echo '--- orphan FK: achievements.user_id が存在しないusersを指していないか ---'
select a.id, a.user_id
from achievements a
where not exists (select 1 from users u where u.id = a.user_id);

\echo '--- orphan FK: entitlements.user_id(解決済みのみ)が存在しないusersを指していないか ---'
select e.id, e.user_id
from entitlements e
where e.user_id is not null
  and not exists (select 1 from users u where u.id = e.user_id);

\echo '--- orphan(ソフト参照): outboxのsource_type=purchaseなのに対応するpurchasesが無いもの ---'
-- source_id/target_system_keyはDB外部キーを持たないテキスト列のため、FK制約では守られない。
select o.id, o.source_id
from integration_outbox_events o
where o.source_type = 'purchase'
  and not exists (select 1 from purchases p where p.id::text = o.source_id);

\echo '--- 不正status: 各statusカラムの現在の分布(想定外の値が無いか目視確認する) ---'
-- CHECK制約で許可値は既に強制されているため異常値は原理上入り得ないが、
-- 想定より偏った分布(例: dead/failedが異常に多い)が無いか目視確認するために出力する。
select 'purchases.status' as column_name, status as value, count(*) from purchases group by status
union all
select 'purchases.grant_status', grant_status, count(*) from purchases group by grant_status
union all
select 'entitlements.status', status, count(*) from entitlements group by status
union all
select 'entitlements.application_status', application_status, count(*) from entitlements group by application_status
union all
select 'entitlements.reversal_status', reversal_status, count(*) from entitlements group by reversal_status
union all
select 'integration_inbox_events.status', status, count(*) from integration_inbox_events group by status
union all
select 'integration_outbox_events.status', status, count(*) from integration_outbox_events group by status
union all
select 'notification_outbox_events.status', status, count(*) from notification_outbox_events group by status
union all
select 'stripe_webhook_events.status', status, count(*) from stripe_webhook_events group by status
union all
select 'purchase_grant_steps.status', status, count(*) from purchase_grant_steps group by status
order by 1, 2;

\echo '--- null不整合: statusがprocessingなのにclaim_token/lease_expires_atが未設定(fencing機構を経由していない異常) ---'
select 'integration_inbox_events' as table_name, id from integration_inbox_events
  where status = 'processing' and (claim_token is null or lease_expires_at is null)
union all
select 'integration_outbox_events', id from integration_outbox_events
  where status = 'processing' and (claim_token is null or lease_expires_at is null)
union all
select 'notification_outbox_events', id from notification_outbox_events
  where status = 'processing' and (claim_token is null or lease_expires_at is null)
union all
select 'stripe_webhook_events', id from stripe_webhook_events
  where status = 'processing' and (claim_token is null or lease_expires_at is null)
union all
select 'purchase_grant_steps', id from purchase_grant_steps
  where status = 'processing' and (claim_token is null or lease_expires_at is null)
union all
select 'entitlements(application)', id from entitlements
  where application_status = 'applying' and (application_claim_token is null or application_lease_expires_at is null)
union all
select 'entitlements(reversal)', id from entitlements
  where reversal_status = 'reversing' and (reversal_claim_token is null or reversal_lease_expires_at is null);

\echo '--- 10分以上processing中(fencing/lease機構経由でも異常に長時間放置されている疑い) ---'
-- purchasesはclaim/lease列を持たないためcreated_atで近似する(処理開始時刻の厳密値ではない点に注意)。
-- integration_inbox_events/stripe_webhook_eventsはclaimed_at(実際にclaimされた時刻)を使う。
-- outbox系/purchase_grant_stepsはclaimed_at列が無いため、lease_expires_atが既に
-- 10分以上前に切れている(=再claimも進んでいない)ことをもって「放置」とみなす近似値。
select 'purchases' as table_name, id, created_at as reference_time
  from purchases where status = 'processing' and created_at < now() - interval '10 minutes'
union all
select 'integration_inbox_events', id, claimed_at
  from integration_inbox_events where status = 'processing' and claimed_at < now() - interval '10 minutes'
union all
select 'stripe_webhook_events', id, claimed_at
  from stripe_webhook_events where status = 'processing' and claimed_at < now() - interval '10 minutes'
union all
select 'integration_outbox_events', id, lease_expires_at
  from integration_outbox_events where status = 'processing' and lease_expires_at < now() - interval '10 minutes'
union all
select 'notification_outbox_events', id, lease_expires_at
  from notification_outbox_events where status = 'processing' and lease_expires_at < now() - interval '10 minutes'
union all
select 'purchase_grant_steps', id, lease_expires_at
  from purchase_grant_steps where status = 'processing' and lease_expires_at < now() - interval '10 minutes';

\echo '--- failed / dead 件数(要調査対象の総量把握) ---'
select 'purchases.failed' as bucket, count(*) from purchases where status = 'failed'
union all
select 'integration_inbox_events.failed', count(*) from integration_inbox_events where status = 'failed'
union all
select 'integration_inbox_events.dead', count(*) from integration_inbox_events where status = 'dead'
union all
select 'integration_outbox_events.failed', count(*) from integration_outbox_events where status = 'failed'
union all
select 'integration_outbox_events.dead', count(*) from integration_outbox_events where status = 'dead'
union all
select 'notification_outbox_events.failed', count(*) from notification_outbox_events where status = 'failed'
union all
select 'notification_outbox_events.dead', count(*) from notification_outbox_events where status = 'dead'
union all
select 'stripe_webhook_events.failed', count(*) from stripe_webhook_events where status = 'failed'
union all
select 'stripe_webhook_events.dead', count(*) from stripe_webhook_events where status = 'dead'
union all
select 'purchase_grant_steps.failed', count(*) from purchase_grant_steps where status = 'failed'
union all
select 'purchase_grant_steps.dead', count(*) from purchase_grant_steps where status = 'dead'
union all
select 'entitlements.application_failed', count(*) from entitlements where application_status = 'failed'
union all
select 'entitlements.application_dead', count(*) from entitlements where application_status = 'dead'
union all
select 'entitlements.reversal_failed', count(*) from entitlements where reversal_status = 'failed'
union all
select 'entitlements.reversal_dead', count(*) from entitlements where reversal_status = 'dead';

\echo '--- RPC実行権限(§12/§15と同じ確認): anon/authenticatedがpublicスキーマの関数を実行できないこと ---'
select p.proname as function_name, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
order by 1, 2;

\echo '--- migration履歴(Supabase管理DBのみ。supabase_migrations.schema_migrationsが存在する場合のみ意味を持つ) ---'
select version, name
from supabase_migrations.schema_migrations
order by version;

\echo '=== 完了(上記のいずれかに行が出力された場合は要調査。1件でも異常があればmigrationを適用せず報告すること) ==='
