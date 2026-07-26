-- 千ノ国パスポート Phase C-0 PR4(§11 既存データ相当マイグレーション試験)。
--
-- tests/migrations/duplicate-checks.sql(§5.2)は`supabase db reset`直後の空DBに
-- 対して実行すると、重複0件が自明にしか確認できない(scripts/test-migrations.sh内の
-- 既存コメントで明記された既知の限界)。本フィクスチャは、これらのunique制約の対象
-- テーブル(achievements/purchase_grant_steps/entitlements/integration_inbox_events/
-- stripe_webhook_events)に「既存データ相当」の複数行を投入し、duplicate-checks.sqlの
-- 重複検出クエリが複数行・複数キーの組み合わせが存在する状態でも誤検知しない
-- (=正しいデータを重複と誤判定しない)ことを確認できるようにする。
--
-- 意図的に「同じ値の一部だけが重複するが、unique制約のキー全体では重複しない」行を
-- 複数含める(例: 同じentitlement_idだが異なるsource_system_key、同じevent_idだが
-- 異なるsource_system_key)。これらが誤って重複と判定されないことは、duplicate-checks.sql
-- のGROUP BY対象カラムが正しいことの実質的な検証になる。

begin;

do $$
declare
  v_user1 uuid;
  v_user2 uuid;
  v_user3 uuid;
  v_purchase1 uuid;
  v_purchase2 uuid;
begin
  insert into users (line_user_id, display_name, common_user_id, kokudaka, gacha_tickets)
  values ('fixture-line-user-1', '既存データ相当ユーザー1', 'fixture-common-user-1', 1200, 3)
  returning id into v_user1;

  insert into users (line_user_id, display_name, common_user_id, kokudaka, gacha_tickets)
  values ('fixture-line-user-2', '既存データ相当ユーザー2', 'fixture-common-user-2', 300, 0)
  returning id into v_user2;

  insert into users (line_user_id, display_name, kokudaka, gacha_tickets)
  values ('fixture-line-user-3', '既存データ相当ユーザー3(common_user_id未設定)', 0, 1)
  returning id into v_user3;

  -- purchases + purchase_grant_steps: (purchase_id, step_key)のunique制約対象。
  -- 同一purchase内で複数step_key、複数purchase間で同じstep_keyが並存することを確認する。
  insert into purchases (user_id, stripe_session_id, item_type, amount, grant_amount, status, grant_status)
  values (v_user1, 'fixture-session-1', 'kokudaka', 1000, 500, 'completed', 'granted')
  returning id into v_purchase1;

  insert into purchase_grant_steps (purchase_id, step_key, status)
  values
    (v_purchase1, 'balance_granted', 'completed'),
    (v_purchase1, 'agent_sale_recorded', 'completed'),
    (v_purchase1, 'referral_confirmed', 'completed');

  insert into purchases (user_id, stripe_session_id, item_type, amount, grant_amount, status, grant_status)
  values (v_user2, 'fixture-session-2', 'gacha_ticket', 500, 1, 'completed', 'granted')
  returning id into v_purchase2;

  insert into purchase_grant_steps (purchase_id, step_key, status)
  values
    (v_purchase2, 'balance_granted', 'completed'), -- v_purchase1と同じstep_keyだが別purchase_id(重複ではない)
    (v_purchase2, 'notification_sent', 'completed');

  -- achievements: (user_id, achievement_type)のunique制約対象。
  insert into achievements (user_id, achievement_type)
  values
    (v_user1, 'region_complete_kanto'),
    (v_user1, 'region_complete_tohoku'), -- v_user1で複数の異なるachievement_type(重複ではない)
    (v_user2, 'region_complete_kanto'); -- v_user1と同じachievement_typeだが別user_id(重複ではない)

  -- entitlements: (source_system_key, entitlement_id)のunique制約対象。
  insert into entitlements (entitlement_id, common_user_id, user_id, entitlement_type, quantity, source_system_key)
  values
    ('fixture-ent-001', 'fixture-common-user-1', v_user1, 'kokudaka', 100, 'sengoku-ai'),
    ('fixture-ent-002', 'fixture-common-user-2', v_user2, 'gacha_ticket', 2, 'sengoku-ai'),
    -- 同じentitlement_id文字列だが発行元システムが異なる(重複ではない、§6.2)。
    ('fixture-ent-001', 'fixture-common-user-1', v_user1, 'gacha_ticket', 1, 'other-system');

  -- integration_inbox_events: (source_system_key, event_id)のunique制約対象。
  insert into integration_inbox_events (source_system_key, event_id, event_type, payload, payload_hash, status, event_version)
  values
    ('sengoku-ai', 'fixture-evt-001', 'entitlement.granted', '{"fixture":true}'::jsonb, 'fixture-hash-001', 'succeeded', '1.0'),
    ('sengoku-ai', 'fixture-evt-002', 'order.paid', '{"fixture":true}'::jsonb, 'fixture-hash-002', 'succeeded', '1.0'),
    -- 同じevent_id文字列だが発行元システムが異なる(重複ではない、event_idの採番空間はsource_system_key単位)。
    ('other-system', 'fixture-evt-001', 'entitlement.granted', '{"fixture":true}'::jsonb, 'fixture-hash-003', 'succeeded', '1.0');

  -- stripe_webhook_events: stripe_event_idのunique制約対象(グローバル一意)。
  insert into stripe_webhook_events (stripe_event_id, event_type, payload, status)
  values
    ('evt_fixture_001', 'checkout.session.completed', '{"fixture":true}'::jsonb, 'succeeded'),
    ('evt_fixture_002', 'checkout.session.completed', '{"fixture":true}'::jsonb, 'succeeded');
end $$;

commit;
