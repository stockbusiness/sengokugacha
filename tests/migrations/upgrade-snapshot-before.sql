-- 千ノ国パスポート PR #147マージ前最終修正指示§3。
-- fixture投入直後・PR #147の新規マイグレーション適用前の状態を記録する
-- (このデータベースはテスト専用の使い捨てDBであり、このテーブル自体もDB丸ごとの
-- DROPで後始末される)。

create table _upgrade_snapshot (
  table_name text primary key,
  row_count bigint not null,
  status_checksum text
);

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'users', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from users;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'agents', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from agents;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'purchases', count(*), md5(coalesce(string_agg(id::text || ':' || status || ':' || grant_status, ',' order by id), ''))
from purchases;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'purchase_grant_steps', count(*), md5(coalesce(string_agg(id::text || ':' || status, ',' order by id), ''))
from purchase_grant_steps;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'achievements', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from achievements;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'entitlements', count(*),
  md5(coalesce(string_agg(id::text || ':' || status || ':' || application_status || ':' || reversal_status, ',' order by id), ''))
from entitlements;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'integration_inbox_events', count(*), md5(coalesce(string_agg(id::text || ':' || status, ',' order by id), ''))
from integration_inbox_events;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'stripe_webhook_events', count(*), md5(coalesce(string_agg(id::text || ':' || status, ',' order by id), ''))
from stripe_webhook_events;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'integration_outbox_events', count(*), md5(coalesce(string_agg(id::text || ':' || status, ',' order by id), ''))
from integration_outbox_events;

insert into _upgrade_snapshot (table_name, row_count, status_checksum)
select 'notification_outbox_events', count(*), md5(coalesce(string_agg(id::text || ':' || status, ',' order by id), ''))
from notification_outbox_events;

\echo '--- upgrade test: before-snapshot recorded ---'
select * from _upgrade_snapshot order by table_name;
