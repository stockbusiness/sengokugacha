-- 武将カード(写実・シネマティック寄りでよい)と城下町内覧画像(将来Unity製メタバースとして
-- 実装される想定のため、過度なフォトリアルは避けゲームエンジン風のスタイルに寄せたい)とで、
-- 求められる画風の方向性が異なるため、共通スタイルプロンプトを用途別に分離する。
-- 既存のstyle_prompt_templateは削除せず、両方の初期値としてコピーしておく(未設定なら空欄のまま)。
alter table ai_image_settings
  add column if not exists warlord_style_prompt_template text,
  add column if not exists metaverse_style_prompt_template text;

update ai_image_settings
set warlord_style_prompt_template = coalesce(warlord_style_prompt_template, style_prompt_template)
where warlord_style_prompt_template is null;
