-- 千ノ国パスポート Stripe取得待ち期間対応指示書 §6.2(Reconciliation)。
--
-- purchase/entitlement/integration系の静かな不整合を検知するための読み取り専用スナップショット。
-- 方針(指示書§6.2「方針」通り): 自動修正は一切行わない。検出・記録のみ。修正操作は
-- 既存の管理画面(/admin/integration-recovery、/admin/purchases)から人が判断して行う。
--
-- 全チェックを1つのSQL関数に集約し、TypeScript側でのN+1クエリを避ける
-- (scripts/production-migration-preflight.sqlの個別チェックと同じ判定ロジックを、
-- 定期実行しやすい単一関数の形に再構成したもの)。
create or replace function reconciliation_snapshot()
returns table (
  category text,
  check_name text,
  count bigint,
  detail text
) as $$
begin
  -- Purchase ------------------------------------------------------------

  return query
  select 'purchase'::text, 'completed_but_grant_not_granted'::text, count(*)::bigint,
         'purchases.status=completedなのにgrant_status<>grantedの件数'::text
  from purchases where status = 'completed' and grant_status <> 'granted';

  return query
  select 'purchase'::text, 'granted_but_step_incomplete'::text, count(distinct p.id)::bigint,
         'purchases.grant_status=grantedなのにbalance_grantedステップが未完了の件数'::text
  from purchases p
  join purchase_grant_steps s on s.purchase_id = p.id and s.step_key = 'balance_granted'
  where p.grant_status = 'granted' and s.status <> 'completed';

  return query
  select 'purchase'::text, 'grant_failed'::text, count(*)::bigint,
         'purchases.grant_status=failedの件数(手動再実行が必要)'::text
  from purchases where grant_status = 'failed';

  -- Entitlement -----------------------------------------------------------

  return query
  select 'entitlement'::text, 'revoked_but_not_reversed'::text, count(*)::bigint,
         'entitlements.status=revokedなのにreversal_status<>reversedの件数(取消未完了)'::text
  from entitlements where status = 'revoked' and reversal_status <> 'reversed';

  return query
  select 'entitlement'::text, 'user_unresolved'::text, count(*)::bigint,
         'entitlements.user_id未解決(resolution_dismissed_at is null)の件数'::text
  from entitlements where user_id is null and resolution_dismissed_at is null;

  return query
  select 'entitlement'::text, 'application_stuck_processing'::text, count(*)::bigint,
         'application_status=applyingのままapplication_lease_expires_atが1時間以上前の件数(長期滞留)'::text
  from entitlements where application_status = 'applying' and application_lease_expires_at < now() - interval '1 hour';

  return query
  select 'entitlement'::text, 'reversal_stuck_processing'::text, count(*)::bigint,
         'reversal_status=reversingのままreversal_lease_expires_atが1時間以上前の件数(長期滞留)'::text
  from entitlements where reversal_status = 'reversing' and reversal_lease_expires_at < now() - interval '1 hour';

  return query
  select 'entitlement'::text, 'application_dead'::text, count(*)::bigint,
         'application_status=deadの件数(試行上限到達、手動対応が必要)'::text
  from entitlements where application_status = 'dead';

  -- Integration -------------------------------------------------------------

  return query
  select 'integration'::text, 'common_user_id_null'::text, count(*)::bigint,
         'users.common_user_id未解決の件数(/admin/integration-recoveryで個別再解決可能)'::text
  from users where common_user_id is null;

  return query
  select 'integration'::text, 'common_user_id_duplicate'::text, count(*)::bigint,
         '同一common_user_idが複数のローカルユーザーに紐づいている件数(あってはならない状態)'::text
  from (
    select common_user_id from users where common_user_id is not null
    group by common_user_id having count(*) > 1
  ) dup;

  return query
  select 'integration'::text, 'unresolved_agent_assignment'::text, count(*)::bigint,
         '未解決の担当代理店割当(unresolved_agent_assignments)の件数'::text
  from unresolved_agent_assignments where resolved_at is null;

  return query
  select 'integration'::text, 'unresolved_common_user_merge'::text, count(*)::bigint,
         '未解決のcommon_user.merged統合イベントの件数'::text
  from unresolved_common_user_merges where status = 'pending';

  return query
  select 'integration'::text, 'common_user_merge_conflict'::text, count(*)::bigint,
         '未解決のcommon_user.merged競合(統合先が別ユーザーに割当済み)の件数'::text
  from common_user_merge_conflicts where resolved_at is null;

  return query
  select 'integration'::text, 'inbox_failed_or_dead'::text, count(*)::bigint,
         'integration_inbox_events.status in (failed, dead)の件数'::text
  from integration_inbox_events where status in ('failed', 'dead');

  return query
  select 'integration'::text, 'outbox_failed_or_dead'::text, count(*)::bigint,
         'integration_outbox_events.status in (failed, dead)の件数'::text
  from integration_outbox_events where status in ('failed', 'dead');

  return query
  select 'integration'::text, 'notification_failed_or_dead'::text, count(*)::bigint,
         'notification_outbox_events.status in (failed, dead)の件数'::text
  from notification_outbox_events where status in ('failed', 'dead');

  return query
  select 'integration'::text, 'common_user_resolution_attempts_stuck'::text, count(*)::bigint,
         'common_user_id再解決がlease_expires_atを1時間以上超過したまま残っている件数(長期滞留)'::text
  from common_user_resolution_attempts where lease_expires_at < now() - interval '1 hour';

end;
$$ language plpgsql stable;
