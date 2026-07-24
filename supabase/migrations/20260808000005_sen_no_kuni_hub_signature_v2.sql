-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-3(§7)。
-- 既存v1署名(HMAC-SHA256(timestamp + "." + raw_body))はそのまま維持しつつ、
-- key_id/timestamp/nonce/event_version/idempotency_key/raw_bodyを署名対象に含める
-- v2署名をシステム単位で併存させる。

-- v1_disabled_at: このシステムでv1署名の受け付けを止める日時(§7.3「v1停止日時を決定」)。
-- 未設定(null)ならv1を無期限に許可する(既存接続を破壊しない、§7.1)。新規連携は
-- 接続開始時点でこの列にnow()を設定しておくことでv2必須にできる(§7.3「新規連携はv2必須」、
-- 運用上の取り決めでありDB制約では強制しない)。
alter table sen_no_kuni_hub_settings
  add column v1_disabled_at timestamptz,
  add column v1_last_used_at timestamptz,
  add column v1_usage_count bigint not null default 0;

-- v1利用ログ(§7.3「v1利用ログを記録」)の原子的インクリメント。read-modify-writeを
-- 避けるため、単一UPDATE文で完結させる(adjust_user_balance等と同じ設計方針)。
create or replace function record_sen_no_kuni_hub_v1_usage(p_key_id text)
returns void
language sql
as $$
  update sen_no_kuni_hub_settings
  set v1_usage_count = v1_usage_count + 1, v1_last_used_at = now()
  where key_id = p_key_id;
$$;
