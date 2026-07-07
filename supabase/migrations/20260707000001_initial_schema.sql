-- 戦国経済圏OS(戦国パスポート) 初期スキーマ
-- 04_mvp_spec_v1.2.md 「2. データベース設計」+ 8章で追加確定した login_logs に基づく

-- ============================================================
-- 代理店関連(Phase1は記録のみ)
-- ============================================================

create table agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rank text not null default 'アドバイザー'
    check (rank in ('アドバイザー', 'ディレクター', 'エージェント')),
  referral_code text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ユーザー・パスポート関連
-- ============================================================

create table users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  display_name text,
  rank text not null default '足軽'
    check (rank in ('足軽', '侍', '武将', '軍師', '奉行', '大名', '将軍')),
  kokudaka int not null default 0,
  senko int not null default 0,
  gacha_tickets int not null default 0,
  referring_agent_id uuid references agents(id),
  created_at timestamptz not null default now()
);

create index idx_users_referring_agent_id on users(referring_agent_id);

-- ============================================================
-- 武将・国データ
-- ============================================================

create table provinces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- 例: 美濃、尾張
  region text not null, -- 8地方区分
  is_final_province boolean not null default false, -- 美濃国のみtrue
  unlock_condition_count int, -- 例: 60 (他60国制圧で解放)
  display_order int,
  landmark_name text, -- 将来の3D空間内シンボル建造物名(例:岐阜城)
  theme_description text, -- 将来の3D空間演出用の世界観設定文
  has_castle_town boolean not null default false, -- 将来、城下町3D空間を持つ国かどうかのフラグ
  castle_town_concept_art_url text, -- 制圧演出で表示する城下町コンセプトアート
  created_at timestamptz not null default now()
);

create table warlords (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references provinces(id),
  name text not null,
  rarity text not null
    check (rarity in ('足軽級', '侍級', '武将級', '軍師級', '大名級')),
  slot_type text not null
    check (slot_type in ('common', 'mid', 'rare')), -- 国内3体のうちどのスロットか
  stats_json jsonb not null default '{}'::jsonb, -- 統率/知略/勇猛など
  lore text, -- 逸話
  image_url text, -- カードイラスト(城下町の情景を感じさせる1枚絵)
  gacha_reveal_animation_url text, -- 当たり演出用の事前レンダリング動画/Lottieファイル
  tenka_toitsu_image_url text, -- 天下統一verの合成済み画像URL
  created_at timestamptz not null default now()
);

create index idx_warlords_province_id on warlords(province_id);

create table user_warlords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  warlord_id uuid not null references warlords(id),
  count int not null default 1, -- 被り枚数(合成素材用)
  acquired_at timestamptz not null default now(),
  unique (user_id, warlord_id)
);

create index idx_user_warlords_user_id on user_warlords(user_id);

create table user_provinces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  province_id uuid not null references provinces(id),
  is_conquered boolean not null default false,
  conquered_at timestamptz,
  unique (user_id, province_id)
);

create index idx_user_provinces_user_id on user_provinces(user_id);

-- ============================================================
-- ガチャ関連
-- ============================================================

create table gacha_config (
  id uuid primary key default gen_random_uuid(),
  base_daily_free_limit int not null default 1,
  base_daily_paid_limit int not null default 3,
  event_free_limit_override int,
  event_paid_limit_override int,
  event_start_at timestamptz,
  event_end_at timestamptz,
  preset_name text, -- 通常/小規模イベント/大型イベント
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table gacha_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  warlord_id uuid not null references warlords(id),
  is_paid boolean not null default false, -- 無料/有料の別
  conquered_provinces_count_at_draw int not null default 0, -- 抽選時点の制圧済み国数(排出率検証用)
  created_at timestamptz not null default now()
);

create index idx_gacha_logs_user_id_created_at on gacha_logs(user_id, created_at);

-- ============================================================
-- 代理店関連(続き。usersテーブル定義後に置く売上・実績イベント)
-- ============================================================

create table agent_sales (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id),
  buyer_user_id uuid not null references users(id),
  amount int not null, -- 円
  type text not null check (type in ('self', 'referral')),
  source text not null, -- gacha/pass/nft等、何の購入か
  created_at timestamptz not null default now()
);

create index idx_agent_sales_agent_id on agent_sales(agent_id);
create index idx_agent_sales_buyer_user_id on agent_sales(buyer_user_id);

create table achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  achievement_type text not null, -- 例: "tenka_toitsu", "region_complete_kanto" 等
  referring_agent_id uuid references agents(id), -- 参考データのみ(売上集計とは切り離す)
  achieved_at timestamptz not null default now()
);

create index idx_achievements_user_id on achievements(user_id);

-- ============================================================
-- 決済関連
-- ============================================================

create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  stripe_session_id text not null unique,
  item_type text not null check (item_type in ('kokudaka', 'gacha_ticket', 'tenka_pass')),
  amount int not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_purchases_user_id on purchases(user_id);

-- ============================================================
-- ログイン記録(04_mvp_spec 8章: 3日継続率KPI計測用。1日1回のユニーク記録)
-- ============================================================

create table login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  login_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, login_date)
);

create index idx_login_logs_user_id on login_logs(user_id);

-- ============================================================
-- RLS: 全テーブルへのアクセスはサーバー側(service role key)経由のみとし、
-- anon/authenticated ロールからは一切アクセスさせない(ポリシーなし=デフォルト拒否)。
-- ============================================================

alter table agents enable row level security;
alter table users enable row level security;
alter table provinces enable row level security;
alter table warlords enable row level security;
alter table user_warlords enable row level security;
alter table user_provinces enable row level security;
alter table gacha_config enable row level security;
alter table gacha_logs enable row level security;
alter table agent_sales enable row level security;
alter table achievements enable row level security;
alter table purchases enable row level security;
alter table login_logs enable row level security;
