-- 城主プラン(全国お城プロジェクト)Phase 1の基盤テーブル。
-- 詳細仕様は「城主プラン実装要件定義書」を参照。今回は同要件書23章が指定する
-- 「推奨する実装開始範囲」1〜9のみを対象とし、地域経済活動報酬・段階販売枠拡張
-- (30→60→100)・イベント/協賛/貸出/譲渡は対象外(将来拡張を妨げない列は持たせる)。

-- 城主本人がアドバイザーとして自ら区画を販売した場合を判定するための、agents↔usersの
-- 紐付け。stripe webhookの既存実装で「この紐付けが無い」と明記されていた欠落を埋める。
alter table agents add column if not exists user_id uuid references users(id);
alter table agents add constraint agents_user_id_unique unique (user_id);

-- 8.7 TC4「代理店候補(アドバイザー未満)」を表現するため、既存3値の下に1値追加する。
-- 外部同期のrole_level(1〜3)はこの値にはマッピングされない(常にlocalで手動付与)。
alter table agents drop constraint agents_rank_check;
alter table agents add constraint agents_rank_check
  check (rank in ('代理店候補', 'アドバイザー', 'ディレクター', 'エージェント'));

-- ============================================================
-- 城マスタ
-- ============================================================

create table castles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefecture text,
  region text,
  status text not null default 'draft' check (status in ('draft', 'recruiting', 'published', 'hidden')),
  description text,
  main_image_url text,
  unity_reference text, -- 将来のUnity連携用の列のみ。ロジックは今回追加しない。
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table castles enable row level security;

-- 城主プランのシングルトン設定(payment_settings/line_settingsと同じ運用)。
create table castle_lord_plan_settings (
  id uuid primary key default gen_random_uuid(),
  plan_price_yen int not null default 1000000,
  min_agent_rank_for_lord text not null default 'アドバイザー',
  min_agent_rank_for_commission text not null default 'アドバイザー',
  retroactive_payout_enabled boolean not null default false,
  contract_term_months int not null default 12,
  initial_plot_capacity int not null default 30,
  stage2_plot_capacity int not null default 60,  -- 構造のみ(Phase1では付与ロジック無し)
  stage3_plot_capacity int not null default 100, -- 構造のみ(Phase1では付与ロジック無し)
  land_plot_standard_price_yen int not null default 300000,
  reservation_expiry_minutes int not null default 1440,
  commission_confirmation_grace_days int not null default 8,
  updated_at timestamptz not null default now()
);
alter table castle_lord_plan_settings enable row level security;

-- ============================================================
-- 城主契約(要件書6.4の9状態の状態遷移マトリクスをこの1テーブルで表現する。
-- 「申込」は単にdraft状態でのinsertとして扱い、別テーブルは作らない)
-- ============================================================

create table castle_lord_contracts (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references users(id),
  agent_id uuid references agents(id), -- 申込者自身の代理店レコード(最低資格チェック・自己販売判定に使用)
  desired_castle_id uuid references castles(id),
  castle_id uuid references castles(id), -- 確定後のみセット
  applicant_type text not null default 'individual' check (applicant_type in ('individual', 'corporate')),
  company_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  business_plan_text text,
  screening_notes text,
  status text not null default 'draft' check (status in
    ('draft', 'screening', 'approved', 'payment_pending', 'training', 'active', 'suspended', 'expired', 'terminated')),
  plan_price_yen int,               -- 契約確定時点のプラン価格スナップショット
  contract_term_months int,
  contract_start_date date,
  contract_end_date date,
  initial_plot_capacity int not null default 30,
  stage2_plot_capacity int not null default 60,
  stage3_plot_capacity int not null default 100,
  min_agent_rank_snapshot text,
  purchase_id uuid, -- プラン代金決済(purchasesへのFKはPR7のpurchases拡張後に追加する)
  signed_at timestamptz,
  activated_at timestamptz,
  terminated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table castle_lord_contracts enable row level security;
create index idx_castle_lord_contracts_applicant on castle_lord_contracts(applicant_user_id);
create index idx_castle_lord_contracts_castle_status on castle_lord_contracts(castle_id, status);
-- 城につき有効契約は1件のみ。
create unique index uq_castle_lord_contracts_active_castle on castle_lord_contracts(castle_id) where status = 'active';
-- 1申込者につき「終了済み」以外の契約は1件のみ(重複申込防止)。
create unique index uq_castle_lord_contracts_open_applicant on castle_lord_contracts(applicant_user_id) where status <> 'terminated';

-- 契約状態変更の履歴(要件書6.3「状態変更時は履歴、変更者、理由、日時を保存する」)。
-- 更新系イベント(6.4実装メモ: expired→activeは同一行を更新し旧値を退避)も
-- snapshot_beforeに更新前の全カラムをjsonbで保存することで同じ仕組みで対応する。
create table castle_lord_contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references castle_lord_contracts(id),
  from_status text,
  to_status text not null,
  changed_by text, -- admin_audit_logsと同じ、監査ログ用の自己申告名
  reason text,
  snapshot_before jsonb,
  created_at timestamptz not null default now()
);
alter table castle_lord_contract_events enable row level security;
create index idx_castle_lord_contract_events_contract on castle_lord_contract_events(contract_id, created_at);
