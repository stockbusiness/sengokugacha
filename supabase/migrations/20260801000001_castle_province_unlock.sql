-- カード収集型「国取り」× 城主経済圏 連携実装指示書v1.0 フェーズ2(6-1・6-6)対応。
-- 城と国(地方)の関連付け、および城の解放条件(公開レベル)を管理する。

create table castle_province_relations (
  id uuid primary key default gen_random_uuid(),
  castle_id uuid not null references castles(id) on delete cascade,
  province_id uuid not null references provinces(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (castle_id, province_id)
);

-- 境目の城は複数国と関連付けられる拡張性を残しつつ(指示書6-1)、解放判定に
-- 使う「主要国」は1城につき1件に限定する。
create unique index uq_castle_province_relations_primary on castle_province_relations(castle_id) where is_primary;

alter table castle_province_relations enable row level security;

-- 解放条件(指示書6-6)。既定値'PUBLIC'は既存の城の見え方を一切変えない
-- (statusによる公開/非公開の扱いのみで、これまで通り動作する)。
alter table castles add column unlock_level text not null default 'PUBLIC'
  check (unlock_level in ('PUBLIC', 'PROVINCE_CONQUEST_REQUIRED', 'REGION_CONQUEST_REQUIRED', 'UNPUBLISHED'));

-- 監修状態(指示書6-1「公開状態・監修状態を持たせる」)。
alter table castles add column historical_review_status text not null default 'unreviewed'
  check (historical_review_status in ('unreviewed', 'reviewed'));
