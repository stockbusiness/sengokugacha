-- リッチメニューの6ボタンを個別に差し替えられるようにするためのテーブル。
-- slot_index は src/lib/rich-menu.ts の RICH_MENU_BUTTONS の配列順(0〜5)に対応する。
-- 未カスタマイズのスロットは行が存在せず、public/rich-menu-panels/<slug>.webp の
-- 既定パネルを使う(src/lib/rich-menu-compose.ts の DEFAULT_PANEL_SLUGS を参照)。
create table rich_menu_panels (
  id uuid primary key default gen_random_uuid(),
  slot_index int not null unique check (slot_index >= 0 and slot_index <= 5),
  label text not null,
  source_image_url text not null,
  updated_at timestamptz not null default now()
);

alter table rich_menu_panels enable row level security;
