-- Passport実装指示書 PR-P1c「販売成果Outbox」(Q3回答 案b)。
--
-- PR-P1aで commission_ledger への新規計上を止めたため、Agencyが受け皿として稼働する
-- までの間、販売が起きても記録がどこにも残らない。その穴を埋める。
--
-- ここに記録するのは「販売の事実」だけで、報酬金額も報酬可否も確定しない。正式な
-- 報酬対象判定はAgency側を正とする(C1回答 修正指示2)。

-- ============================================================
-- 販売事実Outbox
-- ============================================================

create table if not exists sales_fact_outbox_events (
  id uuid primary key default gen_random_uuid(),

  -- 冪等性。event_idは purchase_id から決定的に生成する(ランダム値を使わない)。
  -- 同一販売を10回処理してもこのunique制約で1件に収束する。
  event_id text not null,
  source_system_key text not null default 'passport',

  -- 販売成立時刻。記録時刻ではなく purchases 由来の時刻を入れる。
  occurred_at timestamptz not null,

  -- 誰の販売か。common_user_idはAgencyが正本で、Passport側は未解決のことがある。
  -- 未解決でも販売事実は失わない(C1回答 修正指示3)。passport_user_idは必ず保持する。
  common_user_id text,
  passport_user_id uuid not null references users(id),

  -- 何が売れたか。
  purchase_id uuid not null references purchases(id),
  castle_plot_id uuid references castle_plots(id),
  product_type text not null,
  -- 5システム共通の商品台帳は作らない方針(Q5回答 案b)のため、Passportが自分の担当
  -- 商品として持つ識別子(kokudaka / gacha_ticket / land_plot)をそのまま入れる。
  product_code text,

  -- いくらの販売か。浮動小数点は使わず、整数の最小通貨単位で保存する
  -- (C1回答 修正指示4)。JPYなら円そのもの。報酬金額は保存しない。
  amount_minor bigint not null,
  currency text not null default 'JPY',

  -- 販売時点の紹介・担当情報のスナップショット(C1回答 修正指示7)。
  -- 後からユーザーマスタの担当者が変わっても、これらの列は上書きしない。
  referral_session_key text,
  registration_referrer_agency_id text,
  assigned_agency_id text,
  sales_agent_id text,
  closing_agent_id text,

  -- 報酬対象の可能性。Passportは確定しないため、当面すべてUNKNOWNが入る。
  -- 販売事実に基づく参考情報であり、報酬確定値ではない。
  eligibility_status text not null default 'UNKNOWN'
    check (eligibility_status in ('UNKNOWN', 'POTENTIALLY_ELIGIBLE', 'NOT_ELIGIBLE')),

  -- 購入処理から引き継ぐ相関ID。
  correlation_id text not null,

  -- 配送する本文と、その照合用ハッシュ。同じevent_idで異なるpayloadが来たら
  -- 整合性異常として検知する(C1回答 修正指示5)。
  payload jsonb not null,
  payload_hash text not null,

  -- 配送状態。Agency受信契約が完了するまで配送しないため、当面すべてpendingのまま。
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'delivering', 'delivered', 'failed', 'dead')),
  delivery_attempt_count int not null default 0,
  last_delivery_error text,
  delivered_at timestamptz,

  -- common_user_idの解決追跡(C1回答 修正指示3)。未解決の行はAgencyへ配送しない。
  common_user_resolution_status text not null default 'UNRESOLVED'
    check (common_user_resolution_status in ('UNRESOLVED', 'RESOLVED', 'FAILED')),
  resolution_attempt_count int not null default 0,
  last_resolution_error text,
  next_resolution_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_system_key, event_id)
);

alter table sales_fact_outbox_events enable row level security;

-- 配送対象の抽出用。未解決の行を配送対象から外す条件をそのままインデックスにする。
create index if not exists idx_sales_fact_outbox_deliverable
  on sales_fact_outbox_events (created_at)
  where delivery_status = 'pending' and common_user_resolution_status = 'RESOLVED';

-- 解決待ちの行を拾う用。
create index if not exists idx_sales_fact_outbox_unresolved
  on sales_fact_outbox_events (next_resolution_at)
  where common_user_resolution_status = 'UNRESOLVED';

create index if not exists idx_sales_fact_outbox_purchase
  on sales_fact_outbox_events (purchase_id);

-- ============================================================
-- 生成と配送のフラグ(C1回答 修正指示6)
-- ============================================================

-- 生成と配送を分ける。配送をOFFにしても、生成済みのOutboxは保持される。
--
-- 行は投入しない。payment_settings / commission_write_settings と同じシングルトン運用で、
-- 行が無ければコード側の既定値(両方false)が返る。マイグレーションを適用しただけでは
-- 何も起きず、設定行の投入忘れが「意図せず動き出す」方向へ働かない。
--
-- 旧報酬計上(commission_write_settings)とは別テーブル・別フラグにしてある。販売事実の
-- 記録を始めても、Passportの旧報酬計上が再開することはない。
create table if not exists sales_fact_outbox_settings (
  id uuid primary key default gen_random_uuid(),
  generation_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table sales_fact_outbox_settings enable row level security;

-- ============================================================
-- 購入処理のステップ追加
-- ============================================================

-- runPurchaseGrant()へ sales_fact_recorded ステップを足すため、既存のCHECK制約を
-- 張り替える。既存の値は全て残したうえで1つ追加するだけなので、既存行は影響を受けない。
alter table purchase_grant_steps drop constraint if exists purchase_grant_steps_step_key_check;
alter table purchase_grant_steps add constraint purchase_grant_steps_step_key_check
  check (step_key in (
    'balance_granted', 'plot_completed', 'commission_posted',
    'agent_sale_recorded', 'referral_confirmed', 'notification_sent',
    'sales_fact_recorded'
  ));
