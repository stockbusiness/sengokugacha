-- 外部購入管理機能(戦国パスポート開発者向け実装指示書v1.0)。
-- 代理店が外部ショップでクロージングした注文を、戦国パスポート管理画面へ手動登録し、
-- 購入者とLINEユーザーの紐付け→区画割当→区画権利付与まで一元管理するための土台。
-- 代理店報酬の計算・確定・支払は外部システムが正のため、今回は一切追加しない
-- (docs/external-purchase-implementation-plan.md 2章「実装対象外」参照)。

-- ============================================================
-- 外部注文(1注文=1件のexternal_orders行)
-- ============================================================

create table external_orders (
  id uuid primary key default gen_random_uuid(),
  external_shop_name text not null,
  external_order_id text not null,
  status text not null default 'draft' check (status in
    ('draft', 'payment_pending', 'payment_confirmed', 'user_link_pending',
     'plot_assignment_pending', 'partially_assigned', 'ready_to_grant',
     'rights_granted', 'cancel_pending', 'cancelled', 'refunded', 'on_hold')),
  purchased_at timestamptz,
  payment_confirmed_at timestamptz,
  amount_yen int not null,
  currency text not null default 'JPY',
  buyer_name text not null,
  buyer_name_kana text,
  buyer_email text,
  buyer_phone text,
  external_customer_id text,
  buyer_address text, -- 業務上必要な場合のみ入力(指示書5-1)
  linked_user_id uuid references users(id), -- 紐付け確定後にセット
  -- 代理店情報は販売記録として保持するのみで、報酬計算には使わない(agentsへのFKは張らずスナップショットとして保持)。
  external_agent_id text,
  agent_name_snapshot text,
  agent_sales_rep_snapshot text,
  referral_url_or_code text,
  castle_id uuid references castles(id),
  evidence_file_path text, -- Storage上の非公開パス(注文確認資料)
  payment_evidence_file_path text, -- 入金確認資料
  admin_memo text,
  registered_by text, -- admin_audit_logsと同じ自己申告actor名
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_shop_name, external_order_id) -- 5-3 重複防止(DBレベル)
);
alter table external_orders enable row level security;
create index idx_external_orders_status on external_orders(status);
create index idx_external_orders_linked_user on external_orders(linked_user_id);
create index idx_external_orders_castle on external_orders(castle_id);

-- ============================================================
-- 注文明細(1注文に複数区画を許容する。7-1)
-- ============================================================

create table external_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references external_orders(id),
  external_product_id text,
  product_name text not null,
  product_type text not null default 'land_plot' check (product_type in ('land_plot')),
  quantity int not null default 1,
  unit_price_yen int not null,
  subtotal_yen int not null,
  created_at timestamptz not null default now()
);
alter table external_order_items enable row level security;
create index idx_external_order_items_order on external_order_items(order_id);

-- ============================================================
-- 区画割当(注文明細↔区画の中間テーブル)。
-- 区画権利そのものは新設テーブルを作らず、既存castle_plots
-- (owner_user_id/sold_at/sold_price_yen)を正本として使う
-- (実装計画4章「権利の正本」参照)。
-- ============================================================

create table external_order_plot_assignments (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references external_order_items(id),
  plot_id uuid not null references castle_plots(id),
  status text not null default 'assigned' check (status in ('assigned', 'changing', 'cancelled')),
  assigned_by text,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);
alter table external_order_plot_assignments enable row level security;
create index idx_external_order_plot_assignments_item on external_order_plot_assignments(order_item_id);
-- 二重割当防止(7-4): 同一区画への「有効な」割当は同時に1件のみ。
create unique index uq_external_order_plot_assignments_active_plot
  on external_order_plot_assignments(plot_id) where status = 'assigned';

-- ============================================================
-- 注文状態変更履歴(castle_lord_contract_eventsと同型)。
-- ============================================================

create table external_order_status_histories (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references external_orders(id),
  from_status text,
  to_status text not null,
  changed_by text,
  reason text,
  snapshot_before jsonb,
  created_at timestamptz not null default now()
);
alter table external_order_status_histories enable row level security;
create index idx_external_order_status_histories_order on external_order_status_histories(order_id, created_at);

-- ============================================================
-- LINE個別通知の送達記録(成功・失敗・再送・重複防止。10章)。
-- ============================================================

create table line_notification_logs (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null check (notification_type in
    ('user_link_requested', 'plot_assigned', 'rights_granted', 'plot_changed',
     'rights_revoked', 'refund_applied')),
  target_type text not null check (target_type in ('external_order', 'castle_lord_contract')),
  target_id uuid not null,
  line_user_id text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table line_notification_logs enable row level security;
create index idx_line_notification_logs_target on line_notification_logs(target_type, target_id);
-- 同一通知の重複送信防止(10-2): 同一対象・同一種別の「成功済み」送信は1件のみ。
create unique index uq_line_notification_logs_sent
  on line_notification_logs(target_type, target_id, notification_type) where status = 'sent';

-- ============================================================
-- 監査ログの構造化(既存の自由記述detailsは維持し、列追加のみ。後方互換)。
-- ============================================================

alter table admin_audit_logs add column target_type text;
alter table admin_audit_logs add column target_id uuid;
alter table admin_audit_logs add column before_snapshot jsonb;
alter table admin_audit_logs add column after_snapshot jsonb;

-- ============================================================
-- castle_plots への参照列追加。
-- ============================================================

-- この区画が外部注文経由で売れた場合の紐付け(Stripe直販分はplot_reservations.purchase_id側で判別)。
alter table castle_plots add column source_order_item_id uuid references external_order_items(id);

-- メタバース内覧側の対応物件(片方向の参照のみ。権利の正本はcastle_plots側に一本化する)。
alter table castle_plots add column metaverse_property_id uuid references metaverse_properties(id);
