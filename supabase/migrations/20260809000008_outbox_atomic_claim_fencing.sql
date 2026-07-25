-- 千ノ国パスポート Phase C-0 PR4(§8.2 Outbox drain排他制御、実地確認で発覚)。
--
-- POST /api/admin/integration-outbox/drainのdrainTable()は、status in ('pending','failed')の
-- 行をSELECTしてループで送信し、送信結果をid指定のみのUPDATEで記録していた。claim_token・
-- lease・行ロックのいずれも無いため、管理者が2並列でdrainを叩く(連打・複数タブ)と、
-- 両方のリクエストが同じ行を取得して同時に送信処理(confirmReferral/notifyPlotPurchase等の
-- 外部副作用)を行ってしまい、二重送信が起こり得た(指示書§8.2で明示的に想定されていた
-- ギャップ)。purchase_grant_steps等と同じ設計方針で、行単位の原子的claim(fencing token)を
-- integration_outbox_events/notification_outbox_events双方に追加する。

alter table integration_outbox_events
  add column claim_token uuid,
  add column lease_expires_at timestamptz,
  add column next_retry_at timestamptz;

alter table integration_outbox_events drop constraint integration_outbox_events_status_check;
alter table integration_outbox_events add constraint integration_outbox_events_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'dead'));

alter table notification_outbox_events
  add column claim_token uuid,
  add column lease_expires_at timestamptz,
  add column next_retry_at timestamptz;

alter table notification_outbox_events drop constraint notification_outbox_events_status_check;
alter table notification_outbox_events add constraint notification_outbox_events_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'dead'));

-- integration_outbox_events -------------------------------------------------

create or replace function claim_integration_outbox_event(
  p_id uuid,
  p_claim_token uuid,
  p_lease_seconds int default 300,
  p_max_attempts int default 10
) returns text as $$
declare
  v_status text;
  v_attempt_count int;
  v_lease_expires_at timestamptz;
  v_next_retry_at timestamptz;
begin
  select status, attempt_count, lease_expires_at, next_retry_at
    into v_status, v_attempt_count, v_lease_expires_at, v_next_retry_at
  from integration_outbox_events
  where id = p_id
  for update;

  if not found then return 'not_found'; end if;
  if v_status = 'sent' then return 'already_sent'; end if;
  if v_status = 'dead' then return 'dead'; end if;

  if v_status = 'processing' and v_lease_expires_at is not null and v_lease_expires_at > now() then
    return 'in_progress'; -- 他のdrainリクエストが処理中(二重送信防止の要)。
  end if;

  if v_status not in ('pending', 'failed', 'processing') then
    return 'not_eligible';
  end if;

  if v_next_retry_at is not null and v_next_retry_at > now() then
    return 'not_due'; -- バックオフ期間中。
  end if;

  if v_attempt_count >= p_max_attempts then
    update integration_outbox_events set status = 'dead' where id = p_id;
    return 'dead';
  end if;

  update integration_outbox_events
  set status = 'processing',
      claim_token = p_claim_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1
  where id = p_id;

  return 'claimed';
end;
$$ language plpgsql;

create or replace function mark_integration_outbox_sent(
  p_id uuid,
  p_claim_token uuid
) returns boolean as $$
declare
  v_count int;
begin
  update integration_outbox_events
  set status = 'sent', sent_at = now(), next_retry_at = null
  where id = p_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;

create or replace function mark_integration_outbox_failed(
  p_id uuid,
  p_claim_token uuid,
  p_error text
) returns boolean as $$
declare
  v_count int;
  v_attempt_count int;
begin
  select attempt_count into v_attempt_count
  from integration_outbox_events
  where id = p_id and claim_token = p_claim_token and status = 'processing';
  if not found then return false; end if;

  update integration_outbox_events
  set status = 'failed',
      last_error = p_error,
      next_retry_at = now() + make_interval(secs => least(power(2, v_attempt_count)::int, 120) * 10)
  where id = p_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;

-- notification_outbox_events -------------------------------------------------

create or replace function claim_notification_outbox_event(
  p_id uuid,
  p_claim_token uuid,
  p_lease_seconds int default 300,
  p_max_attempts int default 10
) returns text as $$
declare
  v_status text;
  v_attempt_count int;
  v_lease_expires_at timestamptz;
  v_next_retry_at timestamptz;
begin
  select status, attempt_count, lease_expires_at, next_retry_at
    into v_status, v_attempt_count, v_lease_expires_at, v_next_retry_at
  from notification_outbox_events
  where id = p_id
  for update;

  if not found then return 'not_found'; end if;
  if v_status = 'sent' then return 'already_sent'; end if;
  if v_status = 'dead' then return 'dead'; end if;

  if v_status = 'processing' and v_lease_expires_at is not null and v_lease_expires_at > now() then
    return 'in_progress';
  end if;

  if v_status not in ('pending', 'failed', 'processing') then
    return 'not_eligible';
  end if;

  if v_next_retry_at is not null and v_next_retry_at > now() then
    return 'not_due';
  end if;

  if v_attempt_count >= p_max_attempts then
    update notification_outbox_events set status = 'dead' where id = p_id;
    return 'dead';
  end if;

  update notification_outbox_events
  set status = 'processing',
      claim_token = p_claim_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1
  where id = p_id;

  return 'claimed';
end;
$$ language plpgsql;

create or replace function mark_notification_outbox_sent(
  p_id uuid,
  p_claim_token uuid
) returns boolean as $$
declare
  v_count int;
begin
  update notification_outbox_events
  set status = 'sent', sent_at = now(), next_retry_at = null
  where id = p_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;

create or replace function mark_notification_outbox_failed(
  p_id uuid,
  p_claim_token uuid,
  p_error text
) returns boolean as $$
declare
  v_count int;
  v_attempt_count int;
begin
  select attempt_count into v_attempt_count
  from notification_outbox_events
  where id = p_id and claim_token = p_claim_token and status = 'processing';
  if not found then return false; end if;

  update notification_outbox_events
  set status = 'failed',
      last_error = p_error,
      next_retry_at = now() + make_interval(secs => least(power(2, v_attempt_count)::int, 120) * 10)
  where id = p_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;
