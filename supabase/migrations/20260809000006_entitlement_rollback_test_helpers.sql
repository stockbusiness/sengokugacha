-- 千ノ国パスポート Phase C-0 PR4(§4.5 rollback試験)。
--
-- process_entitlement_grant()/process_entitlement_revocation()は、claim_entitlement_
-- application()/claim_entitlement_reversal()をネスト呼び出しし、残高更新・
-- application_status/reversal_status更新までを単一トランザクションとして実行するため、
-- 途中で例外が起きればclaim自体(状態遷移・attempt_count増加)ごとロールバックされる
-- (20260808000003の設計方針と同じ)。この性質を検証するため、claim後に意図的に例外を
-- 発生させるテスト専用関数を用意する。本番コードパス(grantEntitlement/
-- retryResolveEntitlementGrant/revokeEntitlement)からは一切呼ばれない。

create or replace function _test_only_force_fail_after_entitlement_application_claim(
  p_entitlement_row_id uuid
) returns void as $$
declare
  v_claim record;
begin
  select * into v_claim from claim_entitlement_application(p_entitlement_row_id);
  if v_claim.claim_outcome <> 'claimed' then
    raise exception 'claim_entitlement_applicationがclaimedを返しませんでした: %', v_claim.claim_outcome;
  end if;
  raise exception 'intentional test failure after application claim';
end;
$$ language plpgsql;

create or replace function _test_only_force_fail_after_entitlement_reversal_claim(
  p_entitlement_row_id uuid
) returns void as $$
declare
  v_claim record;
begin
  select * into v_claim from claim_entitlement_reversal(p_entitlement_row_id);
  if v_claim.claim_outcome <> 'claimed' then
    raise exception 'claim_entitlement_reversalがclaimedを返しませんでした: %', v_claim.claim_outcome;
  end if;
  raise exception 'intentional test failure after reversal claim';
end;
$$ language plpgsql;
