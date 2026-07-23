-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.1)。
-- 既存のrunStep()は「pending更新→副作用実行→completed更新」の3手順が原子的でないため、
-- 副作用(石高付与・ガチャ券付与・区画所有確定・報酬計上・agent_sales記録等)成功後、
-- completed更新前にプロセスが落ちる・DB障害が起きると、次回再実行時に同じ副作用が
-- 再度実行されてしまう(二重付与)。本マイグレーションは、claim_token(fencing token)を
-- 用いた原子的claimによってこれを防止する基盤を追加する。

alter table purchase_grant_steps
  add column claim_token uuid,
  add column lease_expires_at timestamptz;

alter table purchase_grant_steps drop constraint purchase_grant_steps_status_check;
alter table purchase_grant_steps add constraint purchase_grant_steps_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'dead'));

-- purchase_id+step_key単位で原子的にclaimする。SELECT ... FOR UPDATEで行ロックを取得した
-- 上で状態遷移を判定するため、同時に呼ばれた複数リクエストのうち1つだけがclaimedを得る
-- (claim_integration_inbox_event()と同じ設計方針、動的SQL/EXECUTEは使わない)。
--
-- 戻り値のclaim_tokenは、呼び出し元が副作用完了後にmark_purchase_grant_step_completed()/
-- mark_purchase_grant_step_failed()へ渡すfencing tokenとして機能する。lease_expires_at経過後に
-- 別のリクエストが再claimしてclaim_tokenが更新された場合、古いworker側のclaim_tokenは
-- 一致しなくなるため、古いworkerが後から完了・失敗の更新を行っても無視される。
create or replace function claim_purchase_grant_step(
  p_purchase_id uuid,
  p_step_key text,
  p_lease_seconds int default 300,
  p_max_attempts int default 10
) returns table (claim_outcome text, step_row_id uuid, claim_token uuid) as $$
declare
  v_id uuid;
  v_status text;
  v_attempt_count int;
  v_lease_expires_at timestamptz;
  v_new_token uuid := gen_random_uuid();
begin
  insert into purchase_grant_steps (purchase_id, step_key, status, attempt_count)
  values (p_purchase_id, p_step_key, 'pending', 0)
  on conflict (purchase_id, step_key) do nothing;

  select id, status, attempt_count, lease_expires_at
    into v_id, v_status, v_attempt_count, v_lease_expires_at
  from purchase_grant_steps
  where purchase_id = p_purchase_id and step_key = p_step_key
  for update;

  if v_status = 'completed' then
    claim_outcome := 'already_completed';
    step_row_id := v_id;
    claim_token := null;
    return next;
    return;
  end if;

  if v_status = 'dead' then
    claim_outcome := 'dead';
    step_row_id := v_id;
    claim_token := null;
    return next;
    return;
  end if;

  -- leaseが有効な'processing'行は他のリクエストが処理中とみなし、claimしない。
  if v_status = 'processing' and v_lease_expires_at is not null and v_lease_expires_at > now() then
    claim_outcome := 'in_progress';
    step_row_id := v_id;
    claim_token := null;
    return next;
    return;
  end if;

  if v_attempt_count >= p_max_attempts then
    update purchase_grant_steps set status = 'dead', updated_at = now() where id = v_id;
    claim_outcome := 'dead';
    step_row_id := v_id;
    claim_token := null;
    return next;
    return;
  end if;

  -- 'pending'/'failed'、またはlease切れの'processing'をclaimする。
  update purchase_grant_steps
  set status = 'processing',
      claim_token = v_new_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = v_id;

  claim_outcome := 'claimed';
  step_row_id := v_id;
  claim_token := v_new_token;
  return next;
end;
$$ language plpgsql;

-- claim_tokenが一致し、かつ現在も'processing'の場合のみ完了扱いにする(fencing)。
-- 一致しない(=古いworker、または既に他の更新が入っている)場合はfalseを返す。
create or replace function mark_purchase_grant_step_completed(
  p_step_row_id uuid,
  p_claim_token uuid
) returns boolean as $$
declare
  v_count int;
begin
  update purchase_grant_steps
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_step_row_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;

create or replace function mark_purchase_grant_step_failed(
  p_step_row_id uuid,
  p_claim_token uuid,
  p_error text
) returns boolean as $$
declare
  v_count int;
begin
  update purchase_grant_steps
  set status = 'failed', last_error = p_error, updated_at = now()
  where id = p_step_row_id and claim_token = p_claim_token and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;
