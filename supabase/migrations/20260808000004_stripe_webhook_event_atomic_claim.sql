-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-3(§6)。
-- src/app/api/stripe/webhook/route.tsの既存inbox実装(stripe_webhook_eventsのSELECT→
-- decideStripeInboxAction()による判定→INSERT/UPDATE)は複数のDB往復に分かれており、
-- 同一Stripe eventの並行配信(Stripeからのほぼ同時到達・手動再送と自動再送の重複等)で
-- 二重にstatus='processing'へ進んでしまい得た(SELECTとUPDATEの間に他リクエストが
-- 割り込む余地があった)。purchase_grant_steps/entitlementsと同じ設計方針
-- (claim_purchase_grant_step、マイグレーション20260808000001)をstripe_webhook_eventsへも
-- 適用する。

alter table stripe_webhook_events
  add column claim_token uuid,
  add column claimed_at timestamptz,
  add column lease_expires_at timestamptz;

alter table stripe_webhook_events drop constraint stripe_webhook_events_status_check;
alter table stripe_webhook_events add constraint stripe_webhook_events_status_check
  check (status in ('pending', 'processing', 'succeeded', 'failed', 'dead'));

-- stripe_event_id単位でStripe webhookイベントの処理を原子的にclaimする。
-- claim_tokenは呼び出し側(TypeScript)が生成して渡す(§6.2)。行が存在しなければ
-- ON CONFLICT DO NOTHINGで作成してからSELECT ... FOR UPDATEするため、
-- 同一event_idの並行到達でunique制約違反が呼び出し元まで伝播することはない。
create or replace function claim_stripe_webhook_event(
  p_stripe_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_claim_token uuid,
  p_lease_seconds int default 300,
  p_max_attempts int default 10
) returns table (claim_outcome text, inbox_event_id uuid) as $$
declare
  v_id uuid;
  v_status text;
  v_attempt_count int;
  v_lease_expires_at timestamptz;
begin
  insert into stripe_webhook_events (stripe_event_id, event_type, payload, status, attempt_count)
  values (p_stripe_event_id, p_event_type, p_payload, 'pending', 0)
  on conflict (stripe_event_id) do nothing;

  select id, status, attempt_count, lease_expires_at
    into v_id, v_status, v_attempt_count, v_lease_expires_at
  from stripe_webhook_events
  where stripe_event_id = p_stripe_event_id
  for update;

  if v_status = 'succeeded' then
    claim_outcome := 'duplicate';
    inbox_event_id := v_id;
    return next;
    return;
  end if;

  if v_status = 'dead' then
    claim_outcome := 'dead';
    inbox_event_id := v_id;
    return next;
    return;
  end if;

  if v_status = 'processing' and v_lease_expires_at is not null and v_lease_expires_at > now() then
    claim_outcome := 'in_progress';
    inbox_event_id := v_id;
    return next;
    return;
  end if;

  if v_attempt_count >= p_max_attempts then
    update stripe_webhook_events set status = 'dead' where id = v_id;
    claim_outcome := 'dead';
    inbox_event_id := v_id;
    return next;
    return;
  end if;

  update stripe_webhook_events
  set status = 'processing',
      claim_token = p_claim_token,
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      event_type = p_event_type,
      payload = p_payload
  where id = v_id;

  claim_outcome := case when v_attempt_count > 0 then 'retryable' else 'new' end;
  inbox_event_id := v_id;
  return next;
end;
$$ language plpgsql;

-- claim_tokenが一致し、かつstatus='processing'の行のみ更新する(fencing)。
-- leaseが切れて別のworkerに再claimされた古いworkerが、誤って完了・失敗の更新を
-- 行うことはない。
create or replace function mark_stripe_webhook_succeeded(
  p_inbox_event_id uuid,
  p_claim_token uuid
) returns boolean as $$
declare
  v_updated int;
begin
  update stripe_webhook_events
  set status = 'succeeded', processed_at = now()
  where id = p_inbox_event_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$ language plpgsql;

create or replace function mark_stripe_webhook_failed(
  p_inbox_event_id uuid,
  p_claim_token uuid,
  p_error text
) returns boolean as $$
declare
  v_updated int;
begin
  update stripe_webhook_events
  set status = 'failed', last_error = p_error
  where id = p_inbox_event_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$ language plpgsql;
