-- AI画像生成機能(武将カード・城下町デジタル内覧の各種画像をOpenAI画像生成APIで作成)。
-- 05_midjourney_guide_v1.0.md / 06_chatgpt_image_guide_v1.0.md の手作業ノウハウ
-- (固定スタイルワード・参照画像によるスタイル一貫性・レアリティ別演出)をAPI化する。

-- AI画像生成設定(シングルトン。payment_settings/agency_integration_settingsと同じ方針)
create table ai_image_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openai',
  api_key text, -- 平文保存(実際のリクエストに使う必要があるため。outbound_api_keyと同じ理由)
  model text not null default 'gpt-image-1',
  style_prompt_template text, -- 毎回自動で付加する共通スタイル文
  warlord_reference_image_url text, -- 武将画像の基準参照画像(スタイル統一用)
  metaverse_reference_image_url text, -- 内覧画像の基準参照画像(スタイル統一用)
  enabled_for_warlords boolean not null default true,
  enabled_for_metaverse boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table ai_image_settings enable row level security;

-- 生成履歴(採用有無に関わらず記録。生成イベントであり各エンティティのカラムには持たせない)
create table ai_generated_images (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  target text, -- metaverse_areaのthumbnail/main等、対象カラムの区別
  prompt text not null,
  style_prompt_snapshot text,
  reference_image_url text,
  provider text not null,
  model text not null,
  adopted boolean not null default false,
  image_url text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table ai_generated_images enable row level security;
create index idx_ai_generated_images_entity on ai_generated_images (entity_type, entity_id);
