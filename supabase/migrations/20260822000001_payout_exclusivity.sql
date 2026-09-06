-- Passport実装指示書 PR-P1d「支払済み操作の排他と件数表示」。
-- C3 の確認(docs/C3_PAYOUT_OPERATION_REVIEW_20260822.md)で見つかった欠落への対応。
--
-- POST /api/admin/payouts は3手に分かれていた。
--   1. commission_ledger から「確定済み・未払い」を SELECT
--   2. payouts へ INSERT
--   3. 対象の commission_ledger を UPDATE
--
-- この3手が同一トランザクションでも排他でもないため、同一受取者への2リクエストが
-- 重なると payouts が2行でき、支払総額が二重計上される。commission_ledger 側は
-- 後勝ちで1つの payout にしか紐づかないため、payouts の合計と ledger の合計が
-- 食い違う。実際の振込は画面外で行うため送金は二重にならないが、清算の記録が壊れる。
--
-- Passport は移管前報酬の清算専用であり、記録の正確さがこの画面の存在意義そのもの。
--
-- 排他に claim/fencing(リース+トークン)は使わない。あれは「複数のワーカーが長時間
-- かかる処理を分担し、途中で落ちても再開できる」ための道具で、支払記録は一瞬で終わる
-- 同期処理であり途中経過を持たない。トランザクション内で対象行をロックするだけで足り、
-- リースの期限切れやトークン管理という余計な状態を持たずに済む。
--
-- 新しい報酬を作成・加算する処理は追加しない。既存の確定済み明細をまとめるだけ。

create or replace function create_payout_for_recipient(
  p_recipient_type text,
  p_recipient_user_id uuid,
  p_recipient_agent_id uuid,
  p_created_by text
) returns table (
  outcome text,
  payout_id uuid,
  line_count int,
  total_amount_yen bigint
) as $$
declare
  v_line_ids uuid[];
  v_count int;
  v_total bigint;
  v_payout_id uuid;
  v_now timestamptz := now();
begin
  if p_recipient_user_id is null and p_recipient_agent_id is null then
    outcome := 'invalid_recipient';
    payout_id := null; line_count := 0; total_amount_yen := 0;
    return next;
    return;
  end if;

  -- ここが本関数の要。for update により、同じ受取者への2つ目の呼び出しは
  -- 1つ目がコミットするまでここで待つ。待った後は payout_id is null の条件を
  -- 再評価するため0件になり、no_target を返す。payouts が2行できることはない。
  --
  -- 受取者で絞ったうえでロックするので、別の受取者への支払は互いにブロックしない。
  -- 列名はすべてテーブル名で修飾する。本関数の OUT パラメータに payout_id があり、
  -- 修飾しないと commission_ledger.payout_id と衝突して
  -- 「column reference "payout_id" is ambiguous」で実行時に落ちる。
  select array_agg(cl.id), count(*), coalesce(sum(cl.amount_yen), 0)
    into v_line_ids, v_count, v_total
  from (
    select commission_ledger.id, commission_ledger.amount_yen
    from commission_ledger
    where commission_ledger.recipient_type = p_recipient_type
      and commission_ledger.status = 'confirmed'
      and commission_ledger.payout_id is null
      and (
        (p_recipient_user_id is not null and commission_ledger.recipient_user_id = p_recipient_user_id)
        or (p_recipient_agent_id is not null and commission_ledger.recipient_agent_id = p_recipient_agent_id)
      )
    for update
  ) cl;

  if v_count is null or v_count = 0 then
    outcome := 'no_target';
    payout_id := null; line_count := 0; total_amount_yen := 0;
    return next;
    return;
  end if;

  insert into payouts (
    recipient_type, recipient_user_id, recipient_agent_id,
    total_amount_yen, status, paid_at, created_by
  ) values (
    p_recipient_type, p_recipient_user_id, p_recipient_agent_id,
    v_total, 'paid', v_now, p_created_by
  ) returning id into v_payout_id;

  update commission_ledger
  set status = 'paid', payout_id = v_payout_id, paid_at = v_now
  where id = any(v_line_ids);

  outcome := 'created';
  payout_id := v_payout_id;
  line_count := v_count;
  total_amount_yen := v_total;
  return next;
end;
$$ language plpgsql;

comment on function create_payout_for_recipient(text, uuid, uuid, text) is
  '確定済み・未払いの報酬明細を受取者単位でまとめて支払済みにする。対象行を for update でロックし、同一受取者への同時実行で payouts が二重作成されないようにする(PR-P1d)。';
