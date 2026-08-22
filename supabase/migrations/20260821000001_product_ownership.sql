-- Passport実装指示書 PR-P2b「商品所有者マップ」。Q5(案b)・Q6(商品コード条件)、
-- および 2026-08-22 のご判断(確認事項1〜7)。
--
-- PR-P2a で「送信元 × 権利種別」の allowlist を入れた。本マイグレーションは Q6 の
-- 残り半分、すなわち商品コードを一致条件へ加える。
--
-- entitlements.product_code は以前から保存されていたが、判定では一度も読まれて
-- いなかった。ここが穴だった。
--
-- 判定順序(ご指定):
--   1. source_system_key が allowlist にあるか   → SOURCE_NOT_ALLOWED
--   2. product_code が送られているか             → PRODUCT_CODE_REQUIRED
--   3. product_code が Passport の担当か         → PRODUCT_NOT_OWNED
--   4. product_code と entitlement_type が一致   → PRODUCT_TYPE_MISMATCH
--   5. 残高適用対象の種別か                       → TYPE_NOT_APPLICABLE
--   6. すべて通過                                 → APPLIED

-- ============================================================
-- 1. 判定結果の値を追加
-- ============================================================

alter table entitlements drop constraint if exists entitlements_application_decision_check;
alter table entitlements add constraint entitlements_application_decision_check
  check (application_decision is null or application_decision in (
    'APPLIED',                -- 残高へ適用した
    'SOURCE_NOT_ALLOWED',     -- 送信元が allowlist に無い
    'PRODUCT_CODE_REQUIRED',  -- product_code が未指定(PR-P2b)
    'PRODUCT_NOT_OWNED',      -- Passport の担当商品ではない(PR-P2b)
    'PRODUCT_TYPE_MISMATCH',  -- 商品コードと種別の組み合わせが不正(PR-P2b)
    'TYPE_NOT_APPLICABLE',    -- 種別が残高へ効果を持たない(NFT作品・会員権・generic等)
    'USER_UNRESOLVED',        -- common_user_id を解決できず適用できない
    'DISMISSED'               -- 運用が再解決を却下済み
  ));

-- ============================================================
-- 2. 商品所有者マップ
-- ============================================================

-- 商品コード → 期待される entitlement_type。Passport の担当でなければ null。
--
-- Q5 のご判断により、5システム共通の商品台帳DBは作らず、Passport を全システムの
-- 正本にもしない。ここに持つのは Passport 自身の担当商品だけで、他システムの担当
-- (戦国マーケットの評議員権・会員権、NFT作品マーケットのクリエイター作品・作品
-- シリアル等)は判定にもテーブルにも持たない。持つと事実上の正本になってしまう。
--
-- この1関数で2つの問いに答える。
--   ・所有しているか   → 戻り値が null でない
--   ・種別と一致するか → 戻り値が entitlement_type と等しい
-- 所有リストと対応表を別々に持つと、片方だけ直したときにずれる。
--
-- 形式要件(ご指定)により完全一致のみ。前後空白を trim して救済せず、大文字小文字も
-- 自動変換しない。救済すると「正しいコードに近い文字列」の範囲が曖昧になる。
--
-- tenka_pass / castle_lord_plan は purchases.item_type には実在するが、Q5 のご判断に
-- より追加しない。既存の購入処理・表示には触れていない(それらは entitlements を
-- 通らない)。
create or replace function entitlement_product_expected_type(
  p_product_code text
) returns text as $$
begin
  return case p_product_code
    when 'SPPT_KOKUDAKA' then 'kokudaka'
    when 'SPPT_GACHA_TICKET' then 'gacha_ticket'
    when 'SPPT_LAND_PLOT' then 'land_plot'
    else null
  end;
end;
$$ language plpgsql immutable;

-- ============================================================
-- 3. 判定を1関数へ集約し直す
-- ============================================================

-- PR-P2a では entitlement_balance_column() と entitlement_application_decision() の
-- 両方に送信元チェックが重複していた。判定が2段のうちは許容できたが、6段になると
-- 必ずずれる。判定順序の正本を entitlement_application_decision() 1本にする。
--
-- 引数が増えるため create or replace では上書きされず多重定義になる。緩い2引数版が
-- 残ると、うっかりそちらを呼んで商品コードチェックを迂回できてしまうので明示的に消す。
drop function if exists entitlement_application_decision(text, text);
drop function if exists entitlement_balance_column(text, text);

create or replace function entitlement_application_decision(
  p_source_system_key text,
  p_product_code text,
  p_entitlement_type text
) returns text as $$
declare
  v_expected_type text;
begin
  if not exists (
    select 1 from entitlement_source_allowlist where source_system_key = p_source_system_key
  ) then
    return 'SOURCE_NOT_ALLOWED';
  end if;

  -- null・空文字・空白のみは「送っていない」と扱う。btrim はこの判定にだけ使い、
  -- コードの照合には一切使わない(下の entitlement_product_expected_type は生の値を見る)。
  if p_product_code is null or btrim(p_product_code) = '' then
    return 'PRODUCT_CODE_REQUIRED';
  end if;

  v_expected_type := entitlement_product_expected_type(p_product_code);

  if v_expected_type is null then
    return 'PRODUCT_NOT_OWNED';
  end if;

  if v_expected_type <> p_entitlement_type then
    return 'PRODUCT_TYPE_MISMATCH';
  end if;

  -- 残高列の対応表は PR-P2a のものをそのまま使う。3つ目のリストを作らない。
  if entitlement_balance_column_for_type(p_entitlement_type) is null then
    return 'TYPE_NOT_APPLICABLE';
  end if;

  return 'APPLIED';
end;
$$ language plpgsql stable;

-- 残高列。判定が APPLIED のときだけ列名を返す。順序判定はここに書かない。
create or replace function entitlement_balance_column(
  p_source_system_key text,
  p_product_code text,
  p_entitlement_type text
) returns text as $$
begin
  if entitlement_application_decision(p_source_system_key, p_product_code, p_entitlement_type) <> 'APPLIED' then
    return null;
  end if;

  return entitlement_balance_column_for_type(p_entitlement_type);
end;
$$ language plpgsql stable;

-- 非適用の理由。TypeScript側 describeDecision() と同じ文言。
create or replace function entitlement_decision_reason(
  p_decision text,
  p_source_system_key text,
  p_product_code text,
  p_entitlement_type text,
  p_common_user_id text
) returns text as $$
begin
  return case p_decision
    when 'APPLIED' then null
    when 'SOURCE_NOT_ALLOWED' then
      format('送信元 %s は entitlement_source_allowlist に未登録', p_source_system_key)
    when 'PRODUCT_CODE_REQUIRED' then
      'product_code が未指定。承認済み送信元は商品コードの送付が必須'
    when 'PRODUCT_NOT_OWNED' then
      format('商品コード %s は Passport の担当商品ではない', coalesce(p_product_code, ''))
    when 'PRODUCT_TYPE_MISMATCH' then
      format('商品コード %s と種別 %s の組み合わせが不正', coalesce(p_product_code, ''), p_entitlement_type)
    when 'TYPE_NOT_APPLICABLE' then
      format('種別 %s は残高への実効果を持たない', p_entitlement_type)
    when 'USER_UNRESOLVED' then
      format('common_user_id=%s をローカルユーザーへ解決できない', coalesce(p_common_user_id, ''))
    when 'DISMISSED' then '運用が再解決を却下済み'
    else null
  end;
end;
$$ language plpgsql immutable;

-- ============================================================
-- 4. 付与
-- ============================================================
--
-- PR-P2a 版(20260820000001)からの差分は3点。
--   ・判定に product_code を渡す
--   ・理由の組み立てを entitlement_decision_reason() へ外出し
--   ・balance_applied_at を「実際に残高が動いたときだけ」設定する
--
-- 3点目はご判断「TYPE_NOT_APPLICABLE になったものを成功付与と表示しないでください」
-- への対応。従来は非適用でも balance_applied_at = now() を入れており、列名に反する
-- 記録になっていた。アプリケーションコードはこの列を読んでいないため安全に変更できる。
--
-- application_status は変更しない。'applied' は claim_entitlement_application() の
-- already_applied ガードが依存する終端マーカーで、ここを変えると無限再試行を防ぐ
-- 仕組みが壊れる。「処理が終わったか」= application_status、「残高へ入れたか」=
-- application_decision という PR-P2a の分離を維持する。

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
        application_decision_reason = entitlement_decision_reason('DISMISSED', null, null, null, null)
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

  -- PR-P2b。判定順序は entitlement_application_decision() にだけ存在する。
  -- 取消側は allowlist も商品マップも再評価せず、ここで記録する application_decision
  -- だけを見る(理由は entitlement_balance_was_applied() のコメント)。
  v_decision := entitlement_application_decision(
    v_entitlement.source_system_key, v_entitlement.product_code, v_entitlement.entitlement_type);
  v_column := entitlement_balance_column(
    v_entitlement.source_system_key, v_entitlement.product_code, v_entitlement.entitlement_type);

  if v_column is not null and v_resolved_user_id is null then
    -- common_user_idが未解決のユーザーには残高を反映できない。application_statusは
    -- not_appliedのまま保持し、後日解決が進んだ時点で再送/手動再解決する。
    update entitlements
    set application_decision = 'USER_UNRESOLVED',
        application_decision_reason = entitlement_decision_reason(
          'USER_UNRESOLVED', null, null, null, v_entitlement.common_user_id)
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
  -- v_columnがnullの場合は台帳記録のみで完了扱いにする。理由は application_decision に残る。

  update entitlements
  set application_status = 'applied',
      -- PR-P2b。残高が実際に動いたときだけ入れる。非適用の行に「適用日時」が
      -- 入っていると、成功付与と読めてしまう。
      balance_applied_at = case when v_column is null then null else now() end,
      application_decision = v_decision,
      application_decision_reason = entitlement_decision_reason(
        v_decision,
        v_entitlement.source_system_key,
        v_entitlement.product_code,
        v_entitlement.entitlement_type,
        v_entitlement.common_user_id)
  where id = p_entitlement_row_id;

  if not v_was_revoked then
    claim_outcome := 'claimed';
    resolved_user_id := v_resolved_user_id;
    return next;
    return;
  end if;

  -- 順序逆転ケース: 取消がgrantより先に届いていた。同一トランザクション内で取消まで完結させる。
  select * into v_revocation_claim from process_entitlement_revocation(p_entitlement_row_id);

  -- 'reversed_without_balance_change' も取消は完了している(戻すべき残高が無かっただけ)。
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
-- 5. 取消は変更しない
-- ============================================================
--
-- PR-P2a で取消の判断根拠を「付与時に実際へ残高へ入れたか」(entitlement_balance_was_applied)
-- に変えたため、判定条件を2段から6段に増やしても取消側は無変更で正しく動く。
--
-- ご指定の「取消時に現在の商品マップを再評価しない」は、この仕組みで既に満たされている。
-- process_entitlement_revocation() は entitlement_balance_column_for_type()(種別のみ)と
-- application_decision しか見ない。ここを商品マップの再評価に変えると、
--   ・担当商品を後から増やす → 入れていない残高を引く
--   ・担当商品を後から減らす → 入れた残高を戻さない
-- が起きる。
