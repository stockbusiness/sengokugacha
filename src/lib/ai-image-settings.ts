import { createSupabaseServerClient } from "@/lib/supabase-server";

export type AiImageSettings = {
  id: string | null;
  provider: string;
  api_key: string | null;
  model: string;
  style_prompt_template: string | null;
  warlord_reference_image_url: string | null;
  metaverse_reference_image_url: string | null;
  enabled_for_warlords: boolean;
  enabled_for_metaverse: boolean;
};

const DEFAULT_STYLE_PROMPT_TEMPLATE = `この参考画像と同じアートスタイル・色調・質感で生成してください。
- 金・黒・赤を基調にした重厚な色合い
- 戦国時代の武将・城下町をテーマにした世界観
- 背景に家紋や金箔模様をあしらった装飾的な演出
- 光と影のコントラストを強めにした、シネマティックで高級感のある仕上がり`;

const DEFAULT_SETTINGS: AiImageSettings = {
  id: null,
  provider: "openai",
  api_key: null,
  model: "gpt-image-1",
  style_prompt_template: DEFAULT_STYLE_PROMPT_TEMPLATE,
  warlord_reference_image_url: null,
  metaverse_reference_image_url: null,
  enabled_for_warlords: true,
  enabled_for_metaverse: true,
};

export async function getAiImageSettings(): Promise<AiImageSettings> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_image_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS;
}
