-- Passport実装指示書 PR-P2a「Entitlement適用範囲の制限」。
--
-- 現状も kokudaka / gacha_ticket 以外は残高へ効果を持たないため、受入条件
-- 「NFT/未知Entitlementを受けても国高・ガチャチケットが変化しない」は既に
-- 満たされている。足りないのは3点。
--
--   1. 送信元(source_system_key)を見ていない。種別だけで判定している
--   2. 非適用と判定した理由がDBに残らない
--   3. 同じ判定式が process_entitlement_grant と process_entitlement_revocation の
--      両方にあり、片方だけ直すと「付与は止まるのに取消では残高が動く」不整合になる
--
-- 3を根本から断つため、種別→残高列の対応表を1つの関数へ集約し、付与・取消の両方が
-- それを使うようにする。送信元 allowlist を見るのは付与側だけで、取消側は「付与時に
-- 実際へ入れたか」だけを見る(理由は entitlement_balance_was_applied() のコメント)。

-- ============================================================
-- 1. 承認済み送信元
-- ============================================================

-- source_system_key の allowlist。行を投入しないため、既定ではどの送信元からも
-- 残高が動かない。
--
-- 将来ゲーム送信元を承認する場合は、
--   (a) sen_no_kuni_hub_settings に鍵を登録する    → 認証を通せるようになる
--   (b) このテーブルへ追加する                      → 残高適用が許可される
-- の2つが揃って初めて残高が動く。片方だけでは動かない。
--
-- Q6のご指示により、次は登録してはいけない:
--   sennokuni-nft-market / sengoku-commerce / ove-wallet / 未知の送信元
create table if not exists entitlement_source_allowlist (
  source_system_key text primary key,
  -- なぜ許可したかを残す。棚卸しのときに判断根拠が要る。
  note text,
  approved_by text,
  created_at timestamptz not null default now()
);

alter table entitlement_source_allowlist enable row level security;

-- ============================================================
-- 2. 判定結果の記録
-- ============================================================

-- application_status は変更しない。あちらはCHECK制約と既存のclaim・再入判定が
-- 依存しており、値を増やすと影響が広がる。「処理が完了したか」を表す
-- application_status と、「どう判定したか」を表す application_decision を分ける。
alter table entitlements
  add column if not exists application_decision text,
  add column if not exists application_decision_reason text;

alter table entitlements drop constraint if exists entitlements_application_decision_check;
alter table entitlements add constraint entitlements_application_decision_check
  check (application_decision is null or application_decision in (
    'APPLIED',              -- 残高へ適用した
    'SOURCE_NOT_ALLOWED',   -- 送信元が allowlist に無い
    'TYPE_NOT_APPLICABLE',  -- 種別が残高へ効果を持たない(NFT作品・会員権・generic等)
    'USER_UNRESOLVED',      -- common_user_id を解決できず適用できない
    'DISMISSED'             -- 運用が再解決を却下済み
  ));

create index if not exists idx_entitlements_application_decision
  on entitlements (application_decision, granted_at);

-- ============================================================
-- 3. 判定の集約
-- ============================================================

-- 種別 → 残高列。付与・取消の両方がこれを唯一の対応表として使う。
--
-- entitlement_type 側の allowlist はここ(コード)に固定する。適用先が users の実在する
-- 列である以上、種別を増やすにはどのみち列とコードの変更が要る。設定テーブルで
-- 増やせるようにすると、「users に列が無い種別」を許可できてしまう。
--
-- この対応表を2箇所に持たせない。片方だけ直すと「付与は止まるのに取消では残高が動く」
-- 不整合が起きる。
create or replace function entitlement_balance_column_for_type(
  p_entitlement_type text
) returns text as $$
begin
  return case p_entitlement_type
    when 'kokudaka' then 'kokudaka'
    when 'gacha_ticket' then 'gacha_tickets'
    else null
  end;
end;
$$ language plpgsql immutable;

-- 付与時の判定。種別に加えて送信元 allowlist を要求する。
-- source_system_key 側は運用で変わるため、テーブル参照にする。
create or replace function entitlement_balance_column(
  p_source_system_key text,
  p_entitlement_type text
) returns text as $$
begin
  if not exists (
    select 1 from entitlement_source_allowlist where source_system_key = p_source_system_key
  ) then
    return null;
  end if;

  return entitlement_balance_column_for_type(p_entitlement_type);
end;
$$ language plpgsql stable;

-- 取消時に残高を戻してよいか。
--
-- 根拠は「付与時に実際へ残高へ入れたか」だけであり、取消の時点で allowlist を
-- 再評価してはいけない。allowlist は運用で変わるため、再評価すると
--   ・未許可のまま付与 → 後から承認 → 取消  で、入れていない残高を引く
--   ・許可して付与     → 後から承認取消 → 取消 で、入れた残高を戻さない
-- の両方が起きる。entitlement_type は行ごとに不変なので従来は問題にならなかったが、
-- 送信元を判定へ加えたことで判定が時間で変わるようになった。
create or replace function entitlement_balance_was_applied(
  p_application_decision text
) returns boolean as $$
begin
  -- 本マイグレーション以前に適用された行は application_decision を持たない。
  -- それらは当時の規則(種別のみ)で実際に加算されているため、戻す対象になる。
  if p_application_decision is null then
    return true;
  end if;

  return p_application_decision = 'APPLIED';
end;
$$ language plpgsql immutable;

-- 非適用の理由を返す。判定そのものは entitlement_balance_column と同じ順序で行う。
create or replace function entitlement_application_decision(
  p_source_system_key text,
  p_entitlement_type text
) returns text as $$
begin
  if not exists (
    select 1 from entitlement_source_allowlist where source_system_key = p_source_system_key
  ) then
    return 'SOURCE_NOT_ALLOWED';
  end if;

  if p_entitlement_type not in ('kokudaka', 'gacha_ticket') then
    return 'TYPE_NOT_APPLICABLE';
  end if;

  return 'APPLIED';
end;
$$ language plpgsql stable;

-- ============================================================
-- 4. 付与(20260810000001 からの差分は判定の外出しと理由の記録のみ)
-- ============================================================

create or replace function process_entitlement_grant(
  p_entitlement_row_id uuid
) returns table (claim_outcome text, resolved_user_id uuid) as $$
declare
  v_entitlement entitlements%rowtype;
  v_column text;
  v_decision text;
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
    update entitlements
    set application_decision = 'DISMISSED',
        application_decision_reason = '運用が再解決を却下済み'
    where id = p_entitlement_row_id;

    claim_outcome := 'dismissed';
    resolved_user_id := v_entitlement.user_id;
    return next;
    return;
  end if;

  if v_entitlement.status = 'revoked' and v_entitlement.application_status = 'applied' then
    claim_outcome := 'already_revoked';
    resolved_user_id := v_entitlement.user_id;
    return next;
    return;
  end if;

  v_was_revoked := (v_entitlement.status = 'revoked');

  v_resolved_user_id := v_entitlement.user_id;
  if v_resolved_user_id is null then
    select id into v_resolved_user_id from users where common_user_id = v_entitlement.common_user_id limit 1;
    if v_resolved_user_id is not null then
      update entitlements set user_id = v_resolved_user_id where id = p_entitlement_row_id;
    end if;
  end if;

  -- PR-P2a。付与は送信元 allowlist を要求する。取消側は allowlist を再評価せず、
  -- 共通の対応表 entitlement_balance_column_for_type() と、ここで記録する
  -- application_decision だけを見る。
  v_column := entitlement_balance_column(v_entitlement.source_system_key, v_entitlement.entitlement_type);
  v_decision := entitlement_application_decision(v_entitlement.source_system_key, v_entitlement.entitlement_type);

  if v_column is not null and v_resolved_user_id is null then
    -- common_user_idが未解決のユーザーには残高を反映できない。application_statusは
    -- not_appliedのまま保持し、後日解決が進んだ時点で再送/手動再解決する。
    update entitlements
    set application_decision = 'USER_UNRESOLVED',
        application_decision_reason = format('common_user_id=%s をローカルユーザーへ解決できない', v_entitlement.common_user_id)
    where id = p_entitlement_row_id;

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
  -- v_columnがnull(allowlist外の送信元、または残高への実効果を持たない種別)の場合は
  -- 台帳記録のみで完了扱いにする。理由は application_decision に残る。

  update entitlements
  set application_status = 'applied',
      balance_applied_at = now(),
      application_decision = v_decision,
      application_decision_reason = case v_decision
        when 'APPLIED' then null
        when 'SOURCE_NOT_ALLOWED' then format('送信元 %s は entitlement_source_allowlist に未登録', v_entitlement.source_system_key)
        when 'TYPE_NOT_APPLICABLE' then format('種別 %s は残高への実効果を持たない', v_entitlement.entitlement_type)
        else null
      end
  where id = p_entitlement_row_id;

  if not v_was_revoked then
    claim_outcome := 'claimed';
    resolved_user_id := v_resolved_user_id;
    return next;
    return;
  end if;

  -- 順序逆転ケース: 取消がgrantより先に届いていた。同一トランザクション内で取消まで完結させる。
  select * into v_revocation_claim from process_entitlement_revocation(p_entitlement_row_id);

  -- PR-P2a。'reversed_without_balance_change' も取消は完了している(戻すべき残高が
  -- 無かっただけ)。以前は generic 等に限られたため放置できたが、送信元を判定へ
  -- 加えたことでこの経路が常態になる。'claimed_reversal_pending' のままだと
  -- /admin/entitlements の再解決が「未解決」と数え続け、運用が再試行を止められない。
  if v_revocation_claim.claim_outcome in ('claimed', 'already_reversed', 'reversed_without_balance_change') then
    claim_outcome := 'claimed_then_reversed';
  else
    claim_outcome := 'claimed_reversal_pending';
  end if;
  resolved_user_id := v_resolved_user_id;
  return next;
end;
$$ language plpgsql;

-- ============================================================
-- 5. 取消(20260809000004 からの差分は判定の外出しのみ)
-- ============================================================

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

  -- PR-P2a。種別→残高列の対応表は付与と共通(entitlement_balance_column_for_type)。
  -- ここに case 式を持たせると、片方だけ直したときに「付与は止まるのに取消では
  -- 残高が動く」不整合が起きる。
  --
  -- 送信元 allowlist はここでは見ない。見るのは「付与時に実際へ入れたか」だけ。
  -- 理由は entitlement_balance_was_applied() のコメントを参照。
  v_column := entitlement_balance_column_for_type(v_entitlement.entitlement_type);

  -- 残高への実効果が無い、付与時に残高へ入れていない、user_id未解決、または
  -- 残高未反映の場合は残高操作をスキップする。
  -- reversal_statusは更新しない(not_reversedのまま保持し、後日application_statusが
  -- 'applied'になった状態でrevokeが再送された際に正しく減算できるようにする)。
  if v_column is null
     or not entitlement_balance_was_applied(v_entitlement.application_decision)
     or v_entitlement.user_id is null
     or v_entitlement.application_status <> 'applied' then
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
