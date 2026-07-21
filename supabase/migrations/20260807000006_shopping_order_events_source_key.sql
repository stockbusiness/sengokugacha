-- 千ノ国パスポート次期改修指示書 P0-2(§6.1)。
-- shopping_order_eventsのevent_id一意性をsource_system_key単位にする(entitlementsと
-- 同様、複数送信元システムが独立したID採番をしている可能性があるため)。
-- 本番接続実績が無い(全体統合対応PR8完了報告書で「未接続」と明記済み)テーブルのため、
-- 既存行の補完は不要な想定だが、念のためnot null化前に不明値を埋める。

alter table shopping_order_events add column source_system_key text;
alter table shopping_order_events add column event_version text;

update shopping_order_events set source_system_key = 'unknown' where source_system_key is null;
alter table shopping_order_events alter column source_system_key set not null;

alter table shopping_order_events drop constraint shopping_order_events_event_id_key;
alter table shopping_order_events add constraint uq_shopping_order_events_source_system_event_id unique (source_system_key, event_id);

-- sen_no_kuni_hub_used_noncesはCron等のバックグラウンドジョブ基盤が無いため無制限に
-- 増加する(§6.4)。管理画面から手動実行できる削除関数を用意する(24時間より前のnonceは
-- タイムスタンプ許容誤差(5分)を大きく超えており、リプレイ防止の実効性を失わない)。
create or replace function cleanup_expired_sen_no_kuni_hub_nonces() returns int as $$
declare
  v_deleted int;
begin
  delete from sen_no_kuni_hub_used_nonces where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$ language plpgsql;
