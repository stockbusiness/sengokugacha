import { createSupabaseServerClient } from "@/lib/supabase-server";

export type AiImageProvider = "openai" | "gemini";

export type AiImageAudience = "warlord" | "metaverse";

export type AiImageSettings = {
  id: string | null;
  provider: AiImageProvider;
  api_key: string | null;
  model: string;
  gemini_api_key: string | null;
  gemini_model: string;
  /** @deprecated warlord_style_prompt_template / metaverse_style_prompt_template に分離済み。移行時の初期値コピー元としてのみ残す。 */
  style_prompt_template: string | null;
  warlord_style_prompt_template: string | null;
  metaverse_style_prompt_template: string | null;
  warlord_reference_image_url: string | null;
  metaverse_reference_image_url: string | null;
  enabled_for_warlords: boolean;
  enabled_for_metaverse: boolean;
};

const DEFAULT_WARLORD_STYLE_PROMPT_TEMPLATE = `この参考画像と同じアートスタイル・色調・質感で生成してください。
- 金・黒・赤を基調にした重厚な色合い
- 戦国時代の武将・城下町をテーマにした世界観
- 背景に家紋や金箔模様をあしらった装飾的な演出
- 光と影のコントラストを強めにした、シネマティックで高級感のある仕上がり`;

// 城下町デジタル内覧の画像は、将来Unity製メタバースとして実装される想定の「予告編」的な
// 位置付けのため、写真のようなフォトリアルにし過ぎると、実際に完成したメタバースの見た目
// (ゲームエンジンで描画されたスタイライズド3D)との間に大きなギャップが生まれてしまう。
// そのため武将カードとは別の、控えめでゲームアセット寄りのスタイル指示をデフォルトにする。
const DEFAULT_METAVERSE_STYLE_PROMPT_TEMPLATE = `この参考画像と同じ配色・世界観で生成してください。ただし写真のような過度なフォトリアルは避けてください。
- 将来Unity製の3Dメタバース空間として実装される想定の「コンセプトアート」であることを意識し、ゲームエンジンで描画したような、やや簡略化されたスタイライズド3Dの質感にする
- 金・黒・赤を基調にした、戦国時代の城下町の世界観
- 陰影は控えめで、現実の3D空間として違和感のない、クリーンで明瞭な仕上がりにする
- 過度な質感の書き込み(毛穴・シワ・写真的なノイズ等)は避ける`;

const DEFAULT_SETTINGS: AiImageSettings = {
  id: null,
  provider: "openai",
  api_key: null,
  model: "gpt-image-1",
  gemini_api_key: null,
  gemini_model: "gemini-2.5-flash-image",
  style_prompt_template: null,
  warlord_style_prompt_template: DEFAULT_WARLORD_STYLE_PROMPT_TEMPLATE,
  metaverse_style_prompt_template: DEFAULT_METAVERSE_STYLE_PROMPT_TEMPLATE,
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

export function getStylePromptTemplate(settings: AiImageSettings, audience: AiImageAudience): string | null {
  return audience === "warlord" ? settings.warlord_style_prompt_template : settings.metaverse_style_prompt_template;
}
