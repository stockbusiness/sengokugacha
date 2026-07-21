-- 千ノ国パスポート 全体統合対応 実装計画(PR1)。
-- Stripe Webhookの安全化に必要な最小限のP0のみを対象とする
-- (ウォレット台帳への全面移行等の大規模改修は対象外)。

-- Stripe event inbox。stripe_event_idのunique制約でWebhook再送時の二重処理を検知する。
create table stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempt_count int not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table stripe_webhook_events enable row level security;

-- 決済処理中であることを表す中間状態を追加する。既存の'pending'/'completed'/'failed'/'refunded'は
-- そのまま維持するため、既存データ・既存ロジックへの影響は無い。
alter table purchases drop constraint purchases_status_check;
alter table purchases add constraint purchases_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'refunded'));

-- 決済の成否(status)と内部権利付与の成否を分離管理する。
-- 「completedなのに権利が未付与」という状態を検出・再実行できるようにするための列。
alter table purchases add column grant_status text not null default 'not_started'
  check (grant_status in ('not_started', 'granted', 'failed'));
alter table purchases add column grant_attempt_count int not null default 0;
alter table purchases add column grant_last_error text;
alter table purchases add column granted_at timestamptz;

-- 原子的残高更新(read-modify-write競合の解消)。動的SQL(EXECUTE)は使わず、
-- 対象カラムをplpgsql内で列挙してインジェクションリスクを避ける。0未満にはしない。
create or replace function adjust_user_balance(p_user_id uuid, p_column text, p_delta int)
returns int
language plpgsql
as $$
declare
  new_value int;
begin
  if p_column = 'kokudaka' then
    update users set kokudaka = greatest(0, kokudaka + p_delta) where id = p_user_id returning kokudaka into new_value;
  elsif p_column = 'gacha_tickets' then
    update users set gacha_tickets = greatest(0, gacha_tickets + p_delta) where id = p_user_id returning gacha_tickets into new_value;
  elsif p_column = 'contribution_points' then
    update users set contribution_points = greatest(0, contribution_points + p_delta) where id = p_user_id returning contribution_points into new_value;
  else
    raise exception 'adjust_user_balance: invalid column %', p_column;
  end if;

  if new_value is null then
    raise exception 'adjust_user_balance: user % not found', p_user_id;
  end if;

  return new_value;
end;
$$;

-- ガチャ券消費専用の原子関数。残高不足時は例外(insufficient_gacha_tickets)を送出し、
-- 呼び出し側(src/lib/gacha.ts)で既存のInsufficientTicketsErrorへ変換する。
create or replace function consume_gacha_ticket(p_user_id uuid)
returns int
language plpgsql
as $$
declare
  new_value int;
begin
  update users set gacha_tickets = gacha_tickets - 1
  where id = p_user_id and gacha_tickets >= 1
  returning gacha_tickets into new_value;

  if new_value is null then
    raise exception 'insufficient_gacha_tickets';
  end if;

  return new_value;
end;
$$;
