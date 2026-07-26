-- 千ノ国パスポート PR #147マージ前最終修正指示§3。
--
-- PR #147が到達する前(commit f76b373、Phase C-0 PR3マージ時点)のマイグレーション
-- (supabase/migrations配下の最初の67ファイル)まで適用したスキーマに対して投入する、
-- 「既存データ相当」のフィクスチャ。tests/migrations/run-upgrade-test.shが、この
-- フィクスチャ投入後にPR #147の新規7マイグレーションを適用し、既存データが
-- 破損・消失せず、かつ新しいロジック(entitlement順序逆転の自動収束等)が
-- 既存データに対しても正しく機能することを検証する。
--
-- スキーマがf76b373時点のものであるため、PR #147で追加された列(claim_token/
-- lease_expires_at/next_retry_at等)やstatus値('processing'/'dead' for outbox)は
-- 一切参照しない。

begin;

do $$
declare
  v_user1 uuid;
  v_user2 uuid;
  v_agent1 uuid;
  v_purchase_completed uuid;
  v_purchase_processing uuid;
begin
  insert into users (line_user_id, display_name, common_user_id, kokudaka, gacha_tickets)
  values ('upgrade-test-user-1', '既存ユーザー1', 'upgrade-test-common-1', 1000, 5)
  returning id into v_user1;

  insert into users (line_user_id, display_name, kokudaka, gacha_tickets)
  values ('upgrade-test-user-2', '既存ユーザー2', 0, 0)
  returning id into v_user2;

  insert into agents (name, referral_code, external_id)
  values ('既存代理店', 'upgrade-test-ref-1', 'upgrade-test-agent-1')
  returning id into v_agent1;

  -- purchases: 正常完了済み1件+処理中(processing中レコード)1件。
  insert into purchases (user_id, stripe_session_id, item_type, amount, grant_amount, status, grant_status)
  values (v_user1, 'upgrade-test-session-completed', 'kokudaka', 1000, 500, 'completed', 'granted')
  returning id into v_purchase_completed;

  insert into purchase_grant_steps (purchase_id, step_key, status)
  values (v_purchase_completed, 'balance_granted', 'completed');

  insert into purchases (user_id, stripe_session_id, item_type, amount, grant_amount, status, grant_status)
  values (v_user2, 'upgrade-test-session-processing', 'gacha_ticket', 500, 1, 'processing', 'processing')
  returning id into v_purchase_processing;

  -- achievements: 既存データ。
  insert into achievements (user_id, achievement_type)
  values (v_user1, 'region_complete_kanto');

  -- entitlements: (a) 正常に付与済み、(b) revoke先行の順序逆転で不整合のまま放置されて
  -- いた既存データ(§1のバグの実例をそのまま「既存データ」として再現する)、
  -- (c) user未解決のまま保留中。
  insert into entitlements (entitlement_id, common_user_id, user_id, entitlement_type, quantity, source_system_key, status, application_status)
  values ('upgrade-test-ent-applied', 'upgrade-test-common-1', v_user1, 'kokudaka', 200, 'upgrade-test-system', 'granted', 'applied');

  insert into entitlements (entitlement_id, common_user_id, user_id, entitlement_type, quantity, source_system_key, status, application_status, reversal_status)
  values ('upgrade-test-ent-stuck-revoked', 'upgrade-test-common-1', v_user1, 'kokudaka', 80, 'upgrade-test-system', 'revoked', 'not_applied', 'not_reversed');

  insert into entitlements (entitlement_id, common_user_id, user_id, entitlement_type, quantity, source_system_key, status, application_status)
  values ('upgrade-test-ent-unresolved', 'upgrade-test-common-unresolved', null, 'kokudaka', 30, 'upgrade-test-system', 'granted', 'not_applied');

  -- integration_inbox_events: 処理済み1件+処理中(processing中レコード)1件。
  insert into integration_inbox_events (source_system_key, event_id, event_type, payload, payload_hash, status)
  values ('upgrade-test-system', 'upgrade-test-evt-succeeded', 'entitlement.granted', '{"fixture":true}'::jsonb, 'upgrade-test-hash-1', 'succeeded');

  insert into integration_inbox_events (source_system_key, event_id, event_type, payload, payload_hash, status)
  values ('upgrade-test-system', 'upgrade-test-evt-processing', 'entitlement.granted', '{"fixture":true}'::jsonb, 'upgrade-test-hash-2', 'processing');

  -- stripe_webhook_events: 既存データ。
  insert into stripe_webhook_events (stripe_event_id, event_type, payload, status)
  values ('upgrade-test-stripe-evt-1', 'checkout.session.completed', '{"fixture":true}'::jsonb, 'succeeded');

  -- integration_outbox_events/notification_outbox_events: baseline時点で存在した
  -- status値のみ(pending/sent/failed。processing/deadはPR #147で追加される)。
  insert into integration_outbox_events (source_type, source_id, event_type, target_system_key, payload, status)
  values ('purchase', 'upgrade-test-outbox-pending', 'referral.confirmed', 'sengoku-ai', '{"fixture":true}'::jsonb, 'pending');

  insert into integration_outbox_events (source_type, source_id, event_type, target_system_key, payload, status)
  values ('purchase', 'upgrade-test-outbox-sent', 'referral.confirmed', 'sengoku-ai', '{"fixture":true}'::jsonb, 'sent');

  insert into notification_outbox_events (source_type, source_id, event_type, target_system_key, payload, status)
  values ('purchase', 'upgrade-test-notif-failed', 'notification.plot_purchased', 'line', '{"fixture":true}'::jsonb, 'failed');
end $$;

commit;
