-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-2(§5)。
-- src/lib/entitlements.tsのhandleEntitlementGranted()/handleEntitlementRevoked()は、
-- application_status/reversal_statusの読み取り→条件付き残高操作→書き戻しが原子的でなく、
-- 並行実行(同一entitlementの同時再送等)で二重付与・二重取消が起こり得た。
-- purchase_grant_stepsと同じ設計方針(claim_purchase_grant_step/apply_purchase_balance_grant、
-- マイグレーション20260808000001・20260808000002)をentitlementsへも適用する。

alter table entitlements
  add column application_claim_token uuid,
  add column application_lease_expires_at timestamptz,
  add column reversal_claim_token uuid,
  add column reversal_lease_expires_at timestamptz;

alter table entitlements drop constraint entitlements_application_status_check;
alter table entitlements add constraint entitlements_application_status_check
  check (application_status in ('not_applied', 'applying', 'applied', 'failed', 'dead'));

alter table entitlements drop constraint entitlements_reversal_status_check;
alter table entitlements add constraint entitlements_reversal_status_check
  check (reversal_status in ('not_reversed', 'reversing', 'reversed', 'failed', 'dead'));

-- entitlements.id単位で残高付与(application)を原子的にclaimする。
create or replace function claim_entitlement_application(
  p_entitlement_row_id uuid,
  p_lease_seconds int default 300,
  p_max_attempts int default 10
) returns table (claim_outcome text, claim_token uuid) as $$
declare
  v_status text;
  v_attempt_count int;
  v_lease_expires_at timestamptz;
  v_new_token uuid := gen_random_uuid();
begin
  select application_status, application_attempt_count, application_lease_expires_at
    into v_status, v_attempt_count, v_lease_expires_at
  from entitlements
  where id = p_entitlement_row_id
  for update;

  if not found then
    claim_outcome := 'not_found';
    claim_token := null;
    return next;
    return;
  end if;

  if v_status = 'applied' then
    claim_outcome := 'already_applied';
    claim_token := null;
    return next;
    return;
  end if;

  if v_status = 'dead' then
    claim_outcome := 'dead';
    claim_token := null;
    return next;
    return;
  end if;

  if v_status = 'applying' and v_lease_expires_at is not null and v_lease_expires_at > now() then
    claim_outcome := 'in_progress';
    claim_token := null;
    return next;
    return;
  end if;

  if v_attempt_count >= p_max_attempts then
    update entitlements set application_status = 'dead' where id = p_entitlement_row_id;
    claim_outcome := 'dead';
    claim_token := null;
    return next;
    return;
  end if;

  update entitlements
  set application_status = 'applying',
      application_claim_token = v_new_token,
      application_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      application_attempt_count = application_attempt_count + 1
  where id = p_entitlement_row_id;

  claim_outcome := 'claimed';
  claim_token := v_new_token;
  return next;
end;
$$ language plpgsql;

-- entitlements.id単位で取消(reversal)を原子的にclaimする。
create or replace function claim_entitlement_reversal(
  p_entitlement_row_id uuid,
  p_lease_seconds int default 300,
  p_max_attempts int default 10
) returns table (claim_outcome text, claim_token uuid) as $$
declare
  v_status text;
  v_attempt_count int;
  v_lease_expires_at timestamptz;
  v_new_token uuid := gen_random_uuid();
begin
  select reversal_status, reversal_attempt_count, reversal_lease_expires_at
    into v_status, v_attempt_count, v_lease_expires_at
  from entitlements
  where id = p_entitlement_row_id
  for update;

  if not found then
    claim_outcome := 'not_found';
    claim_token := null;
    return next;
    return;
  end if;

  if v_status = 'reversed' then
    claim_outcome := 'already_reversed';
    claim_token := null;
    return next;
    return;
  end if;

  if v_status = 'dead' then
    claim_outcome := 'dead';
    claim_token := null;
    return next;
    return;
  end if;

  if v_status = 'reversing' and v_lease_expires_at is not null and v_lease_expires_at > now() then
    claim_outcome := 'in_progress';
    claim_token := null;
    return next;
    return;
  end if;

  if v_attempt_count >= p_max_attempts then
    update entitlements set reversal_status = 'dead' where id = p_entitlement_row_id;
    claim_outcome := 'dead';
    claim_token := null;
    return next;
    return;
  end if;

  update entitlements
  set reversal_status = 'reversing',
      reversal_claim_token = v_new_token,
      reversal_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      reversal_attempt_count = reversal_attempt_count + 1
  where id = p_entitlement_row_id;

  claim_outcome := 'claimed';
  claim_token := v_new_token;
  return next;
end;
$$ language plpgsql;

-- entitlement.granted受信時の処理本体。claim_entitlement_application()をネスト呼び出しする
-- ことで、user_id再解決・残高加算・application_status更新を単一トランザクションにする
-- (途中でプロセスが落ちても全体がロールバックされ、二重付与が起こらない)。
--
-- user_id未解決(common_user_idにまだ対応するローカルユーザーが無い)の場合は、この関数の
-- 呼び出しごとに再解決を試みる(§5.5)。解決できればentitlements.user_idを更新してから
-- 残高付与へ進み、まだ解決できない場合は'user_unresolved'を返しapplication_statusは
-- not_appliedのまま維持する(手動再解決・次回再送での再試行に委ねる)。
create or replace function process_entitlement_grant(
  p_entitlement_row_id uuid
) returns table (claim_outcome text, resolved_user_id uuid) as $$
declare
  v_entitlement entitlements%rowtype;
  v_column text;
  v_claim record;
  v_resolved_user_id uuid;
begin
  select * into v_entitlement from entitlements where id = p_entitlement_row_id for update;

  if not found then
    claim_outcome := 'not_found';
    resolved_user_id := null;
    return next;
    return;
  end if;

  if v_entitlement.status = 'revoked' then
    -- 既にrevoked化されている(=取消が先に処理済み)。残高への再付与は行わない。
    claim_outcome := 'already_revoked';
    resolved_user_id := v_entitlement.user_id;
    return next;
    return;
  end if;

  v_resolved_user_id := v_entitlement.user_id;
  if v_resolved_user_id is null then
    select id into v_resolved_user_id from users where common_user_id = v_entitlement.common_user_id limit 1;
    if v_resolved_user_id is not null then
      update entitlements set user_id = v_resolved_user_id where id = p_entitlement_row_id;
    end if;
  end if;

  v_column := case v_entitlement.entitlement_type
    when 'kokudaka' then 'kokudaka'
    when 'gacha_ticket' then 'gacha_tickets'
    else null
  end;

  if v_column is not null and v_resolved_user_id is null then
    -- common_user_idが未解決のユーザーには残高を反映できない。application_statusは
    -- not_appliedのまま保持し、後日common_user_id解決が進んだ時点で再送/手動再解決する。
    claim_outcome := 'user_unresolved';
    resolved_user_id := null;
    return next;
    return;
  end if;

  select * into v_claim from claim_entitlement_application(p_entitlement_row_id);

  if v_claim.claim_outcome <> 'claimed' then
    claim_outcome := v_claim.claim_outcome;
    resolved_user_id := v_resolved_user_id;
    return next;
    return;
  end if;

  if v_column = 'kokudaka' then
    update users set kokudaka = greatest(0, kokudaka + v_entitlement.quantity) where id = v_resolved_user_id;
  elsif v_column = 'gacha_tickets' then
    update users set gacha_tickets = greatest(0, gacha_tickets + v_entitlement.quantity) where id = v_resolved_user_id;
  end if;
  -- v_columnがnull(残高への実効果を持たない種別、パスポート会員権・城区画等)の場合は
  -- 台帳記録のみで完了扱いにする。

  update entitlements set application_status = 'applied', balance_applied_at = now() where id = p_entitlement_row_id;

  claim_outcome := 'claimed';
  resolved_user_id := v_resolved_user_id;
  return next;
end;
$$ language plpgsql;

-- entitlement.revoked受信時の処理本体。statusの更新順序に関わらず、実際に残高が
-- 反映されていた場合のみ取消(減算)を行う。claim_entitlement_reversal()をネスト呼び出し
-- することで、残高減算とreversal_status更新を単一トランザクションにする。
create or replace function process_entitlement_revocation(
  p_entitlement_row_id uuid
) returns table (claim_outcome text) as $$
declare
  v_entitlement entitlements%rowtype;
  v_column text;
  v_claim record;
begin
  select * into v_entitlement from entitlements where id = p_entitlement_row_id for update;

  if not found then
    claim_outcome := 'not_found';
    return next;
    return;
  end if;

  if v_entitlement.reversal_status = 'reversed' then
    claim_outcome := 'already_reversed'; -- 冪等。
    return next;
    return;
  end if;

  if v_entitlement.status <> 'revoked' then
    update entitlements set status = 'revoked', revoked_at = now() where id = p_entitlement_row_id;
  end if;

  v_column := case v_entitlement.entitlement_type
    when 'kokudaka' then 'kokudaka'
    when 'gacha_ticket' then 'gacha_tickets'
    else null
  end;

  -- 残高への実効果が無い種別、user_id未解決、または残高未反映(application_status<>'applied')の
  -- 場合は残高操作をスキップし、reversal_status='reversed'のみ記録する(「実際に残高が
  -- 反映されていた場合のみ取消を行う」という既存挙動を維持)。
  if v_column is null or v_entitlement.user_id is null or v_entitlement.application_status <> 'applied' then
    update entitlements set reversal_status = 'reversed', balance_reversed_at = now() where id = p_entitlement_row_id;
    claim_outcome := 'reversed_without_balance_change';
    return next;
    return;
  end if;

  select * into v_claim from claim_entitlement_reversal(p_entitlement_row_id);

  if v_claim.claim_outcome <> 'claimed' then
    claim_outcome := v_claim.claim_outcome;
    return next;
    return;
  end if;

  if v_column = 'kokudaka' then
    update users set kokudaka = greatest(0, kokudaka - v_entitlement.quantity) where id = v_entitlement.user_id;
  else
    update users set gacha_tickets = greatest(0, gacha_tickets - v_entitlement.quantity) where id = v_entitlement.user_id;
  end if;

  update entitlements set reversal_status = 'reversed', balance_reversed_at = now() where id = p_entitlement_row_id;

  claim_outcome := 'claimed';
  return next;
end;
$$ language plpgsql;
