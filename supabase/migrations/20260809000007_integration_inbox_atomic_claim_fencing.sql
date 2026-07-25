-- 千ノ国パスポート Phase C-0 PR4(§6.1 Integration Inbox lease/fencing、実地確認で発覚)。
--
-- claim_integration_inbox_event()は「processingのまま10分以上経過した行は再claimを
-- 許可する」というハードコードされた自己回復ヒューリスティックのみで、purchase_grant_steps/
-- entitlements/stripe_webhook_eventsと異なりclaim_token(fencing token)を持たなかった。
-- markInboxEventSucceeded()/markInboxEventFailed()もevent_row_idのみで更新するため、
-- 10分経過後に別workerが再claimして処理を進めていても、先に処理していた(既にハングして
-- いるはずの)古いworkerが後から完了・失敗の更新を行うと横取りされてしまう不整合があった。
--
-- 他のinboxテーブルと同じ設計方針でclaim_token/lease_expires_atを追加し、
-- mark_integration_inbox_succeeded()/mark_integration_inbox_failed()をclaim_token一致
-- 必須(fencing)に変更する。既存の呼び出し元(sen-no-kuni-hub route)の外部向けレスポンス・
-- HTTPステータス・claim_outcomeの意味は変更しない(new/duplicate/conflict/in_progress/dead
-- は従来通り)。

alter table integration_inbox_events
  add column claim_token uuid,
  add column lease_expires_at timestamptz;

create or replace function claim_integration_inbox_event(
  p_source_system_key text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_payload_hash text,
  p_event_version text,
  p_claim_token uuid default gen_random_uuid(),
  p_lease_seconds int default 300,
  p_max_attempts int default 10
) returns table (claim_outcome text, event_row_id uuid) as $$
declare
  v_id uuid;
  v_status text;
  v_payload_hash text;
  v_attempt_count int;
  v_lease_expires_at timestamptz;
begin
  insert into integration_inbox_events
    (source_system_key, event_id, event_type, payload, payload_hash, status, attempt_count, claimed_at,
     event_version, claim_token, lease_expires_at)
  values
    (p_source_system_key, p_event_id, p_event_type, p_payload, p_payload_hash, 'processing', 1, now(),
     p_event_version, p_claim_token, now() + make_interval(secs => p_lease_seconds))
  on conflict (source_system_key, event_id) do nothing
  returning id into v_id;

  if v_id is not null then
    claim_outcome := 'new';
    event_row_id := v_id;
    return next;
    return;
  end if;

  select id, status, payload_hash, attempt_count, lease_expires_at
    into v_id, v_status, v_payload_hash, v_attempt_count, v_lease_expires_at
  from integration_inbox_events
  where source_system_key = p_source_system_key and event_id = p_event_id
  for update;

  if v_payload_hash <> p_payload_hash then
    claim_outcome := 'conflict';
    event_row_id := v_id;
    return next;
    return;
  end if;

  if v_status = 'succeeded' then
    claim_outcome := 'duplicate';
    event_row_id := v_id;
    return next;
    return;
  end if;

  if v_status = 'dead' then
    claim_outcome := 'dead';
    event_row_id := v_id;
    return next;
    return;
  end if;

  -- leaseが有効な'processing'行は他のリクエストが処理中とみなし、claimしない
  -- (lease_expires_atが無い古い行は無条件で「経過済み」とみなし再claimを許可する)。
  if v_status = 'processing' and v_lease_expires_at is not null and v_lease_expires_at > now() then
    claim_outcome := 'in_progress';
    event_row_id := v_id;
    return next;
    return;
  end if;

  if v_attempt_count >= p_max_attempts then
    update integration_inbox_events set status = 'dead' where id = v_id;
    claim_outcome := 'dead';
    event_row_id := v_id;
    return next;
    return;
  end if;

  -- 'pending'/'failed'、またはlease切れの'processing' -> 再試行対象としてclaimする。
  -- 既存の外部向け契約(claim_outcome)を変えないため、初回・再試行どちらも'new'を返す
  -- (従来の挙動を維持する)。
  update integration_inbox_events
  set status = 'processing',
      attempt_count = attempt_count + 1,
      claimed_at = now(),
      claim_token = p_claim_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      event_type = p_event_type,
      payload = p_payload,
      event_version = p_event_version
  where id = v_id;

  claim_outcome := 'new';
  event_row_id := v_id;
  return next;
end;
$$ language plpgsql;

-- claim_tokenが一致し、かつstatus='processing'の行のみ更新する(fencing)。
create or replace function mark_integration_inbox_succeeded(
  p_event_row_id uuid,
  p_claim_token uuid
) returns boolean as $$
declare
  v_count int;
begin
  update integration_inbox_events
  set status = 'succeeded', processed_at = now()
  where id = p_event_row_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;

create or replace function mark_integration_inbox_failed(
  p_event_row_id uuid,
  p_claim_token uuid,
  p_error text
) returns boolean as $$
declare
  v_count int;
begin
  update integration_inbox_events
  set status = 'failed', last_error = p_error
  where id = p_event_row_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;
