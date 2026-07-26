-- 千ノ国パスポート Phase C-0 PR4(§4.3 entitlement順序逆転の最終整合、実地確認で発覚)。
--
-- process_entitlement_revocation()は、残高への実効果が無い/まだ付与されていない
-- (application_status <> 'applied')場合に「反映すべき残高が無いのでスキップした」ことを
-- 示すためreversal_status='reversed'を確定させていた。しかしこれは「取消は完了した」
-- ことを意味する終端状態であり、後からgrantが追いついて残高が実際に反映された状態で
-- revokeが再送されても、reversal_status='reversed'が既に立っているため冒頭のチェックで
-- 即座にalready_reversedとして扱われ、実際の残高減算が永久に行われなくなる不具合が
-- あった(revoke→grant→revoke再送で最終的にkokudaka=0へ収束するはずが、収束しない)。
--
-- 「残高への実効果が無かった」ケースではreversal_statusを更新せず(not_reversedのまま
-- 保持し)、claim_outcomeのみでその旨を伝えるよう修正する。これにより、後続のrevoke再送
-- 時にapplication_statusが'applied'になっていれば、通常のclaim_entitlement_reversal()
-- 経路で正しく残高が減算される。

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
  -- 場合は残高操作をスキップする。reversal_statusは更新しない(not_reversedのまま保持し、
  -- 後日application_statusが'applied'になった状態でrevokeが再送された際に、通常の
  -- claim_entitlement_reversal()経路で正しく残高減算できるようにする)。
  if v_column is null or v_entitlement.user_id is null or v_entitlement.application_status <> 'applied' then
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
