-- AI画像生成の第2プロバイダとしてGoogle Gemini(2.5 Flash Image)に対応する。
-- OpenAIとGeminiのAPIキーを両方保持できるようにし、ai_image_settings.providerで
-- どちらを使うか切り替える(誤って別プロバイダにキーを送らないよう、キー自体は
-- プロバイダごとに別カラムで保持する)。
alter table ai_image_settings
  add column if not exists gemini_api_key text,
  add column if not exists gemini_model text not null default 'gemini-2.5-flash-image';
