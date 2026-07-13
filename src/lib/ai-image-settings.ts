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

const DEFAULT_WARLORD_STYLE_PROMPT_TEMPLATE = `日本の高品質なスマートフォン向けソーシャルゲーム(Fate/Grand OrderやOnmyojiクラス)のキャラクターカードイラストと同等の絵柄・クオリティで生成してください。
- 写真や3DCGレンダリングではなく、緻密な筆致のデジタルペイント/イラストとして描く(実写調にはしない)
- 金・黒・赤を基調にした重厚な配色。背景には家紋・雷光・炎の粉塵・舞い散る花びら・砂塵など、武将の気迫や属性を表す演出エフェクトを加える
- 記念写真のような静止したポーズではなく、武器を構える・鎧や衣が風になびく・鋭い視線で前を見据えるなど、今まさに戦場に立っているかのような躍動感のある構図にする
- 光と影のメリハリはありつつも、画面全体が暗くなりすぎないようにする。人物の顔・表情・鎧の質感がはっきりと見える明るさを保った、シネマティックで高級感のある仕上がり`;

// 城下町デジタル内覧の画像は、将来Unity製メタバースとして実装される想定の「予告編」的な
// 位置付け。当初は「フォトリアルを避ける」ことを重視しすぎ、平面的な2Dマップ図・アイコン風の
// イラストになってしまったため、方向性を修正。目指すのは「実写の観光写真」ではなく
// 「良質なゲームエンジンでレンダリングされた、奥行き・立体感のある3D空間」であること。
const DEFAULT_METAVERSE_STYLE_PROMPT_TEMPLATE = `将来Unity製の3Dメタバース空間として実装される想定の、ゲームの世界観に沿った環境コンセプトアートを生成してください。
- 参考画像と同じ配色・世界観(金・黒・赤を基調にした、戦国時代の城下町の世界観)を踏襲する
- 高品質なゲームエンジンでレンダリングしたような、地形・建物・植生に奥行きと立体感のある仕上がりにする(平面的な2Dマップ図・アイコン風のイラストにはしない)
- ドラマチックな自然光・雲・山並みなど、臨場感のある空気感を出す
- ただし、現代的な要素(現代の車・電線・看板等)が写り込む「実写の観光写真」には見えないようにする。あくまでファンタジー世界のゲーム空間である`;

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
  if (!data) return DEFAULT_SETTINGS;

  // 単純な{...DEFAULT_SETTINGS, ...data}だと、後から追加した列(例:
  // metaverse_style_prompt_template)が既存行ではnullのままになっている場合、そのnullで
  // コード側のデフォルト値が上書きされてしまう(nullも「値がある」として扱われるため)。
  //列ごとにnull/undefinedならデフォルトへフォールバックするようにする。
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AiImageSettings)[]) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== null && value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export function getStylePromptTemplate(settings: AiImageSettings, audience: AiImageAudience): string | null {
  return audience === "warlord" ? settings.warlord_style_prompt_template : settings.metaverse_style_prompt_template;
}
