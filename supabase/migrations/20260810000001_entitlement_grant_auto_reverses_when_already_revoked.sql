-- 千ノ国パスポート Phase C-0 PR4 マージ前最終修正指示 §1。
--
-- process_entitlement_grant()は、status='revoked'であっても
-- application_status<>'applied'(=取消がgrantより先に届き、まだ一度も残高が
-- 反映されていない順序逆転ケース)の場合はブロックせず通常通り残高を付与していた。
-- この結果、entitlementはstatus='revoked'のまま残高だけが反映され、reversal_status
-- は'not_reversed'のまま止まってしまい、元のrevokeイベントが再送されない限り
-- 永久に残高が取り消されない不整合状態になっていた。
--
-- grant適用時にstatus='revoked'であることが判明した場合は、同一トランザクション内で
-- 残高付与に続けて即座にprocess_entitlement_revocation()を呼び出し、取消まで完結させる。
-- これにより「元のrevokeイベントの再送」を前提にせず、grant受信1回だけで
-- status=revoked / reversal_status=reversed / 純増減0(元の残高)へ収束する。
--
-- process_entitlement_revocation()は既存の冪等性・行ロック(FOR UPDATE)・claim機構を
-- そのまま持つ関数であり、ここから呼び出しても同一トランザクション内の再入(同じ行への
-- 再度のFOR UPDATE)は自分自身のロックなので待たされずに成功する。

create or replace function process_entitlement_grant(
  p_entitlement_row_id uuid
) returns table (claim_outcome text, resolved_user_id uuid) as $$
declare
  v_entitlement entitlements%rowtype;
  v_column text;
  v_claim record;
  v_resolved_user_id uuid;
  v_was_revoked boolean;
  v_revocation_claim record;
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
    -- この時点で取消(残高減算)自体はprocess_entitlement_revocation()側の責務で
    -- 既に完了しているか、別途進行中/deadのいずれかであり、grant側からは何もしない。
    claim_outcome := 'already_revoked';
    resolved_user_id := v_entitlement.user_id;
    return next;
    return;
  end if;

  -- grantを適用しようとしている時点で既にstatus='revoked'(かつまだapplication未完了)
  -- ならば、取消(revoke)がgrantより先に届いた順序逆転ケースである。この場合は
  -- grant適用後に自動で取消まで完結させる(下記参照)。
  v_was_revoked := (v_entitlement.status = 'revoked');

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
    -- (v_was_revokedであっても、まだ残高を動かせないため自動収束は次回呼び出しに委ねる)
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

  if not v_was_revoked then
    claim_outcome := 'claimed';
    resolved_user_id := v_resolved_user_id;
    return next;
    return;
  end if;

  -- 順序逆転ケース: 直前でapplication_status='applied'にしたばかりの同一トランザクション内で
  -- 取消まで完結させる。process_entitlement_revocation()はapplication_status='applied'を
  -- 見て通常通りclaim_entitlement_reversal()経由の残高減算まで実行する。
  select * into v_revocation_claim from process_entitlement_revocation(p_entitlement_row_id);

  if v_revocation_claim.claim_outcome = 'claimed' then
    claim_outcome := 'claimed_then_reversed';
  else
    -- 通常はここに到達しない(直前まで本関数が行ロックを保持し続けており、他のトランザクション
    -- が割り込む余地が無いため)。防御的に、grant自体(残高付与)は成功したが取消はまだ
    -- 完了していないことを示す専用のoutcomeを返す。以降のrevoke再送、または次回のgrant
    -- 呼び出し(status='revoked'かつapplication_status='applied'では素通りしてしまうため、
    -- 実際にはrevoke再送での収束に委ねる)で再試行できる。
    claim_outcome := 'claimed_reversal_pending';
  end if;
  resolved_user_id := v_resolved_user_id;
  return next;
end;
$$ language plpgsql;
