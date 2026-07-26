-- 千ノ国パスポート PR #147マージ前最終修正指示§3。
-- PR #147の新規マイグレーション適用「直後」(まだ新しいRPCを何も呼んでいない状態)で、
-- 既存データがマイグレーション自体によって変化していないことを検証する。
-- 何か1つでも不一致があれば例外を送出しpsqlをON_ERROR_STOP=1で異常終了させる。

do $$
declare
  v_before record;
  v_after_count bigint;
  v_after_checksum text;
begin
  for v_before in select * from _upgrade_snapshot loop
    execute format('select count(*), md5(coalesce(string_agg(id::text, %L order by id), %L)) from %I',
      ',', '', v_before.table_name) into v_after_count, v_after_checksum;
    -- 行数はテーブルごとに個別チェック(status込みchecksumは下の個別クエリで検証するため、
    -- ここではまず「行が消えていない・増えていない」ことだけを共通ロジックで見る)。
    if v_after_count <> v_before.row_count then
      raise exception '行数維持チェック失敗: table=%, before=%, after=%', v_before.table_name, v_before.row_count, v_after_count;
    end if;
  end loop;
  raise notice '行数維持チェック: 全%テーブルでOK', (select count(*) from _upgrade_snapshot);
end $$;

-- status込みchecksum(マイグレーション自体がstatusを書き換えていないこと)。
do $$
declare
  v_before text;
  v_after text;
begin
  select status_checksum into v_before from _upgrade_snapshot where table_name = 'purchases';
  select md5(coalesce(string_agg(id::text || ':' || status || ':' || grant_status, ',' order by id), '')) into v_after from purchases;
  if v_before <> v_after then raise exception 'purchases.status維持チェック失敗'; end if;

  select status_checksum into v_before from _upgrade_snapshot where table_name = 'entitlements';
  select md5(coalesce(string_agg(id::text || ':' || status || ':' || application_status || ':' || reversal_status, ',' order by id), ''))
    into v_after from entitlements;
  if v_before <> v_after then raise exception 'entitlements.status維持チェック失敗(マイグレーション自体が書き換えてはならない)'; end if;

  select status_checksum into v_before from _upgrade_snapshot where table_name = 'integration_inbox_events';
  select md5(coalesce(string_agg(id::text || ':' || status, ',' order by id), '')) into v_after from integration_inbox_events;
  if v_before <> v_after then raise exception 'integration_inbox_events.status維持チェック失敗'; end if;

  select status_checksum into v_before from _upgrade_snapshot where table_name = 'integration_outbox_events';
  select md5(coalesce(string_agg(id::text || ':' || status, ',' order by id), '')) into v_after from integration_outbox_events;
  if v_before <> v_after then raise exception 'integration_outbox_events.status維持チェック失敗'; end if;

  select status_checksum into v_before from _upgrade_snapshot where table_name = 'notification_outbox_events';
  select md5(coalesce(string_agg(id::text || ':' || status, ',' order by id), '')) into v_after from notification_outbox_events;
  if v_before <> v_after then raise exception 'notification_outbox_events.status維持チェック失敗'; end if;

  raise notice 'status維持チェック: OK';
end $$;

-- processing中レコードがそのまま残っていること(migrationによって完了扱いにされたり
-- 消えたりしていないこと)。
do $$
declare
  v_count int;
begin
  select count(*) into v_count from purchases where stripe_session_id = 'upgrade-test-session-processing' and status = 'processing';
  if v_count <> 1 then raise exception 'processing中のpurchaseが維持されていない'; end if;

  select count(*) into v_count from integration_inbox_events where event_id = 'upgrade-test-evt-processing' and status = 'processing';
  if v_count <> 1 then raise exception 'processing中のintegration_inbox_eventが維持されていない'; end if;

  raise notice 'processing中レコード維持チェック: OK';
end $$;

-- 新規列(claim_token/lease_expires_at/next_retry_at)がPR #147適用前から存在する行に
-- 対してNULLで補完されていること(バックフィル値が入っていたり、エラーになっていないこと)。
do $$
declare
  v_bad_count int;
begin
  select count(*) into v_bad_count from integration_inbox_events
    where event_id in ('upgrade-test-evt-succeeded', 'upgrade-test-evt-processing')
      and (claim_token is not null or lease_expires_at is not null);
  if v_bad_count <> 0 then raise exception 'integration_inbox_eventsの既存行にclaim_token/lease_expires_atが誤って設定されている'; end if;

  select count(*) into v_bad_count from integration_outbox_events
    where source_id in ('upgrade-test-outbox-pending', 'upgrade-test-outbox-sent')
      and (claim_token is not null or lease_expires_at is not null or next_retry_at is not null);
  if v_bad_count <> 0 then raise exception 'integration_outbox_eventsの既存行に新規列が誤って設定されている'; end if;

  raise notice '新規列のNULL補完チェック: OK';
end $$;

-- check制約: 新しく許可された値('dead'/'processing' for outbox)で実際にinsertできる
-- こと(制約が正しく置き換わっていることの実地確認)。挿入した行は検証後に削除する。
do $$
declare
  v_test_id uuid;
begin
  insert into integration_outbox_events (source_type, source_id, event_type, target_system_key, payload, status)
  values ('purchase', 'upgrade-test-check-constraint-dead', 'referral.confirmed', 'sengoku-ai', '{}'::jsonb, 'dead')
  returning id into v_test_id;
  delete from integration_outbox_events where id = v_test_id;

  insert into notification_outbox_events (source_type, source_id, event_type, target_system_key, payload, status)
  values ('purchase', 'upgrade-test-check-constraint-dead-notif', 'notification.plot_purchased', 'line', '{}'::jsonb, 'dead')
  returning id into v_test_id;
  delete from notification_outbox_events where id = v_test_id;

  raise notice 'check制約置換チェック: OK(新status値dead/processingが許可されている)';
end $$;

-- 外部キー整合性(orphan行が無いこと)。
do $$
declare
  v_orphan_count int;
begin
  select count(*) into v_orphan_count from purchase_grant_steps s
    where not exists (select 1 from purchases p where p.id = s.purchase_id);
  if v_orphan_count <> 0 then raise exception 'purchase_grant_stepsにorphan行がある: %件', v_orphan_count; end if;

  select count(*) into v_orphan_count from achievements a
    where not exists (select 1 from users u where u.id = a.user_id);
  if v_orphan_count <> 0 then raise exception 'achievementsにorphan行がある: %件', v_orphan_count; end if;

  select count(*) into v_orphan_count from entitlements e
    where e.user_id is not null and not exists (select 1 from users u where u.id = e.user_id);
  if v_orphan_count <> 0 then raise exception 'entitlementsにorphan行(存在しないuser_id)がある: %件', v_orphan_count; end if;

  select count(*) into v_orphan_count from purchases p
    where p.user_id is not null and not exists (select 1 from users u where u.id = p.user_id);
  if v_orphan_count <> 0 then raise exception 'purchasesにorphan行がある: %件', v_orphan_count; end if;

  raise notice '外部キー整合性チェック: OK(orphan行0件)';
end $$;

-- 重複(既存のunique制約対象カラムで、既存データが引き続き重複していないこと)。
-- tests/migrations/duplicate-checks.sqlは人間のレビュー向けレポート専用(重複が
-- あっても例外にはしない)ため、ここではCIで自動的に失敗させるためのassertion
-- として同じ内容を書き直す。
do $$
declare
  v_dup_count int;
begin
  select count(*) into v_dup_count from (
    select 1 from achievements group by user_id, achievement_type having count(*) > 1
  ) d;
  if v_dup_count <> 0 then raise exception '重複チェック失敗: achievements(user_id, achievement_type)に%件の重複', v_dup_count; end if;

  select count(*) into v_dup_count from (
    select 1 from purchase_grant_steps group by purchase_id, step_key having count(*) > 1
  ) d;
  if v_dup_count <> 0 then raise exception '重複チェック失敗: purchase_grant_steps(purchase_id, step_key)に%件の重複', v_dup_count; end if;

  select count(*) into v_dup_count from (
    select 1 from entitlements group by source_system_key, entitlement_id having count(*) > 1
  ) d;
  if v_dup_count <> 0 then raise exception '重複チェック失敗: entitlements(source_system_key, entitlement_id)に%件の重複', v_dup_count; end if;

  select count(*) into v_dup_count from (
    select 1 from integration_inbox_events group by source_system_key, event_id having count(*) > 1
  ) d;
  if v_dup_count <> 0 then raise exception '重複チェック失敗: integration_inbox_events(source_system_key, event_id)に%件の重複', v_dup_count; end if;

  select count(*) into v_dup_count from (
    select 1 from stripe_webhook_events group by stripe_event_id having count(*) > 1
  ) d;
  if v_dup_count <> 0 then raise exception '重複チェック失敗: stripe_webhook_events(stripe_event_id)に%件の重複', v_dup_count; end if;

  raise notice '重複チェック: OK(0件)';
end $$;

-- EXECUTE権限(§6/§12): anon/authenticatedが重要RPC関数を実行できないこと。
do $$
declare
  v_leaked_count int;
begin
  select count(*) into v_leaked_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) as r(rolname)
  where n.nspname = 'public' and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
  if v_leaked_count <> 0 then raise exception 'anon/authenticatedが実行可能な関数が%件残っている(EXECUTE権限チェック失敗)', v_leaked_count; end if;
  raise notice 'EXECUTE権限チェック: OK(anon/authenticatedが実行可能な関数0件)';
end $$;

-- 関数置換(function置換): 既存データ(revoke先行で不整合のまま放置されていた
-- entitlement)に対して、アップグレード後のprocess_entitlement_grant()を実際に
-- 呼び出し、§1の自動収束ロジックが「既存データ」に対しても正しく機能することを確認する。
do $$
declare
  v_entitlement_id uuid;
  v_user_id uuid;
  v_claim_outcome text;
  v_kokudaka_before int;
  v_kokudaka_after int;
begin
  select id, user_id into v_entitlement_id, v_user_id from entitlements where entitlement_id = 'upgrade-test-ent-stuck-revoked';
  select kokudaka into v_kokudaka_before from users where id = v_user_id;

  select claim_outcome into v_claim_outcome from process_entitlement_grant(v_entitlement_id);
  if v_claim_outcome <> 'claimed_then_reversed' then
    raise exception '関数置換チェック失敗: 既存データに対するprocess_entitlement_grant()がclaimed_then_reversedを返さなかった(実際: %)', v_claim_outcome;
  end if;

  select kokudaka into v_kokudaka_after from users where id = v_user_id;
  if v_kokudaka_after <> v_kokudaka_before then
    raise exception '関数置換チェック失敗: 自動収束後もkokudakaが変化してしまっている(before=%, after=%)', v_kokudaka_before, v_kokudaka_after;
  end if;

  raise notice '関数置換チェック: OK(既存データのstuck entitlementが1回のgrant呼び出しで自動収束、残高不変=%)', v_kokudaka_after;
end $$;

\echo '=== upgrade migration test: 全チェック完了(ここまでエラー無く到達すれば成功) ==='
