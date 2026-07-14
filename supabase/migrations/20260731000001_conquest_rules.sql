-- カード収集型「国取り」× 城主経済圏 連携実装指示書v1.0 フェーズ1(1-2)対応。
-- 国制覇条件を管理画面から設定可能にするための条件エンジン。
-- 既存60国は本テーブルに行を作らないことで、src/lib/gacha.tsの
-- maybeConquerProvince()が従来通りのハードコード判定(その国の武将3体を
-- 全部所持)にフォールバックし、既存ユーザーの制覇実績には一切影響しない
-- (実装計画3章・4章参照)。

create table conquest_rules (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references provinces(id) on delete cascade,
  rule_type text not null default 'all_specified' check (rule_type in ('all_specified')),
  required_count int,
  min_rarity text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (province_id)
);

create table conquest_rule_warlords (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references conquest_rules(id) on delete cascade,
  warlord_id uuid not null references warlords(id) on delete cascade,
  is_required boolean not null default true,
  unique (rule_id, warlord_id)
);

-- 史実城主情報(指示書3章の用語定義「史実城主」に対応)。公式城主パートナー
-- (castle_lord_contracts)とは別カラムで管理し、画面上も分離して表示する。
alter table castles add column historical_lord_summary text;

alter table conquest_rules enable row level security;
alter table conquest_rule_warlords enable row level security;
