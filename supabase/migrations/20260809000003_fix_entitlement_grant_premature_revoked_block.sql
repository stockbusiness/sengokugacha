-- 千ノ国パスポート Phase C-0(§7 entitlement統合テスト、実地確認で発覚)。
--
-- process_entitlement_grant()は entitlements.status = 'revoked' というだけで
-- 即座に'already_revoked'を返し、以降の処理(claim_entitlement_application経由の
-- 残高付与)を一切行わなかった。これは「実際に一度残高が反映された後に取消された」
-- ケースの二重付与防止としては正しいが、「取消(revoke)がgrantより先に届いた」
-- 順序逆転ケース(application_statusがまだ'not_applied'=一度も付与されていない)でも
-- 同じ理由でgrantを丸ごとブロックしてしまい、entitlementへ永久に残高が反映されない
-- 不具合になっていた(PR #146のintegration-testで実地確認)。
--
-- application_status='applied'(=実際に付与済み)の場合のみ'already_revoked'として
-- ブロックするよう絞り込む。未付与のままrevokeが先着した場合はgrantを通常通り進め、
-- claim_entitlement_application()自体の冪等性(status='applied'なら'already_applied')
-- で二重付与を防ぐ。取消状態の最終収束(revoke再送)は既存方針通り別途対応する。

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
