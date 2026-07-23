-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.2)。
-- PR1(20260808000001)はステップのclaim自体を原子化したが、「副作用の実行」と
-- 「mark_purchase_grant_step_completed()呼び出し」は依然として2つの別々のDB操作であり、
-- 副作用成功直後・completed更新前にプロセスが落ちると二重実行され得る残存リスクがあった
-- (balance_granted/agent_sale_recordedステップ、docs/IMPLEMENTATION_STATUS_BUGFIX.md参照)。
--
-- 本マイグレーションは、この2ステップについて「claim検証・副作用・ステップ完了記録」を
-- 単一のPostgres関数(=単一トランザクション)へ統合する。claim_purchase_grant_step()を
-- 関数内からネスト呼び出しすると、そのSELECT ... FOR UPDATEによる行ロックは外側の関数の
-- トランザクションが終わるまで保持され続けるため、関数の実行途中でプロセスが落ちた場合は
-- トランザクション全体がロールバックされ(claimの'processing'遷移ごと)、副作用だけが
-- 反映されたまま次に持ち越されることが無くなる(true all-or-nothing)。

-- 石高・ガチャ券の付与(purchase-grants.tsのbalance_granted相当)。
-- 対象外のitem_type(例: land_plotの区画本体)はこの関数の呼び出し対象にしない
-- (呼び出し元のsrc/lib/purchase-grants.tsで判定する)。
create or replace function apply_purchase_balance_grant(
  p_purchase_id uuid,
  p_user_id uuid,
  p_column text,
  p_delta int
) returns table (claim_outcome text, new_balance int) as $$
declare
  v_claim record;
  v_new_balance int;
begin
  if p_column not in ('kokudaka', 'gacha_tickets') then
    raise exception 'apply_purchase_balance_grant: invalid column %', p_column;
  end if;

  select * into v_claim from claim_purchase_grant_step(p_purchase_id, 'balance_granted');

  if v_claim.claim_outcome <> 'claimed' then
    claim_outcome := v_claim.claim_outcome;
    new_balance := null;
    return next;
    return;
  end if;

  if p_column = 'kokudaka' then
    update users set kokudaka = greatest(0, kokudaka + p_delta) where id = p_user_id
    returning kokudaka into v_new_balance;
  else
    update users set gacha_tickets = greatest(0, gacha_tickets + p_delta) where id = p_user_id
    returning gacha_tickets into v_new_balance;
  end if;

  perform mark_purchase_grant_step_completed(v_claim.step_row_id, v_claim.claim_token);

  claim_outcome := 'claimed';
  new_balance := v_new_balance;
  return next;
end;
$$ language plpgsql;

-- 紹介経由の購入をagent_salesへ記録する(purchase-grants.tsのagent_sale_recorded相当)。
-- 紹介元代理店が無い(referring_agent_id is null)場合は記録せずステップのみ完了扱いにする
-- (既存のrecordAgentSaleIfReferred()と同じ挙動)。
create or replace function record_purchase_agent_sale(
  p_purchase_id uuid,
  p_user_id uuid,
  p_item_type text,
  p_amount int
) returns table (claim_outcome text) as $$
declare
  v_claim record;
  v_referring_agent_id uuid;
begin
  select * into v_claim from claim_purchase_grant_step(p_purchase_id, 'agent_sale_recorded');

  if v_claim.claim_outcome <> 'claimed' then
    claim_outcome := v_claim.claim_outcome;
    return next;
    return;
  end if;

  select referring_agent_id into v_referring_agent_id from users where id = p_user_id;

  if v_referring_agent_id is not null then
    insert into agent_sales (agent_id, buyer_user_id, amount, type, source, purchase_id)
    values (v_referring_agent_id, p_user_id, p_amount, 'referral', p_item_type, p_purchase_id)
    on conflict (purchase_id) where purchase_id is not null do nothing;
  end if;

  perform mark_purchase_grant_step_completed(v_claim.step_row_id, v_claim.claim_token);

  claim_outcome := 'claimed';
  return next;
end;
$$ language plpgsql;
