-- 千ノ国パスポート Stripe取得待ち期間対応指示書 §5.7。
-- LINEログイン時にcommon_user_idが未解決(sengoku-ai.com側が一時的に応答しなかった等)の
-- まま残ったユーザーを、後日手動で再解決するための試行状況テーブル。
-- 二重再解決を防ぐため、purchase_grant_steps等と同じclaim_token/lease方式で
-- 原子的にclaimしてから外部呼び出しを行う(§5.7「同時実行防止」)。
create table common_user_resolution_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id),
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  claim_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table common_user_resolution_attempts enable row level security;

-- users.id単位でcommon_user_id再解決を原子的にclaimする。既にcommon_user_idが解決済みの
-- 場合は'already_resolved'を返し、外部呼び出し自体を行わない。
create or replace function claim_common_user_resolution(
  p_user_id uuid,
  p_claim_token uuid,
  p_lease_seconds int default 120
) returns text as $$
declare
  v_common_user_id text;
  v_lease_expires_at timestamptz;
begin
  select common_user_id into v_common_user_id from users where id = p_user_id for update;

  if not found then
    return 'not_found';
  end if;

  if v_common_user_id is not null then
    return 'already_resolved';
  end if;

  insert into common_user_resolution_attempts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select lease_expires_at into v_lease_expires_at
  from common_user_resolution_attempts
  where user_id = p_user_id
  for update;

  if v_lease_expires_at is not null and v_lease_expires_at > now() then
    return 'in_progress'; -- 他のリクエストが処理中(二重再解決防止)。
  end if;

  update common_user_resolution_attempts
  set claim_token = p_claim_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      updated_at = now()
  where user_id = p_user_id;

  return 'claimed';
end;
$$ language plpgsql;

-- claim_tokenが一致し、かつまだ未解決(common_user_id is null)の場合のみ書き込む(fencing)。
-- 解決に成功した行はcommon_user_resolution_attemptsから削除する(delete-on-consume、
-- unresolved_agent_assignments等と同じ「存在しない=解決済み」という設計を踏襲)。
create or replace function mark_common_user_resolution_succeeded(
  p_user_id uuid,
  p_claim_token uuid,
  p_common_user_id text
) returns boolean as $$
declare
  v_count int;
begin
  update users
  set common_user_id = p_common_user_id, common_user_synced_at = now()
  where id = p_user_id
    and common_user_id is null
    and exists (
      select 1 from common_user_resolution_attempts
      where user_id = p_user_id and claim_token = p_claim_token and lease_expires_at > now()
    );
  get diagnostics v_count = row_count;

  if v_count > 0 then
    delete from common_user_resolution_attempts where user_id = p_user_id;
    return true;
  end if;
  return false;
end;
$$ language plpgsql;

create or replace function mark_common_user_resolution_failed(
  p_user_id uuid,
  p_claim_token uuid,
  p_error text
) returns boolean as $$
declare
  v_count int;
begin
  update common_user_resolution_attempts
  set last_error = p_error, updated_at = now()
  where user_id = p_user_id and claim_token = p_claim_token;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;
