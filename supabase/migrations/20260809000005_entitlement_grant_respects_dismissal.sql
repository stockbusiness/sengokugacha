-- 千ノ国パスポート Phase C-0 PR4(§4.6 dismissed entitlement、実地確認で発覚)。
--
-- 20260808000010で追加したresolution_dismissed_at(却下)は、管理画面の一括再解決
-- (POST /api/admin/entitlements/retry-resolve)のクエリ側でのみフィルタされており、
-- process_entitlement_grant()自体はresolution_dismissed_atを一切見ていなかった。
-- そのため、RPCを直接(または将来追加され得る個別再解決経路から)呼べば、却下済みの
-- entitlementでも通常通り残高付与まで進んでしまう。DB関数側でも却下状態を尊重するよう
-- 修正し、呼び出し経路に依らず却下済みentitlementが再処理されないことを保証する。
-- resolution_dismissed_at/by/noteは一切書き換えない(却下記録を保持する)。

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

  if v_entitlement.resolution_dismissed_at is not null then
    -- 運用側が「再解決を試みても解消しない」と判断し却下済み。呼び出し経路に依らず処理しない。
    claim_outcome := 'dismissed';
    resolved_user_id := v_entitlement.user_id;
    return next;
    return;
  end if;

  if v_entitlement.status = 'revoked' and v_entitlement.application_status = 'applied' then
    -- 実際に付与済みの状態から取消された場合のみブロックする(二重付与防止)。
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
