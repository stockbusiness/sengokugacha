-- カード合成前(枠・文字なし)のAI生成イラストを保持する列。カード合成後のimage_url
-- (枠・武将名・スキル名・ステータス等が焼き込み済み)を「現在の画像を参照する」の
-- 参照元にすると、既に合成された枠・文字までAIに模写されてしまう恐れがあるため、
-- 参照用には常にこちら(素のイラスト)を使う。
alter table warlords
  add column if not exists ai_portrait_url text;
