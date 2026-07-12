import { getAiImageSettings } from "@/lib/ai-image-settings";

export class AiTextGenerationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// スキル名生成専用の軽量テキストモデル(画像生成用のモデル設定とは別枠。v1では固定)。
const TEXT_MODEL = "gpt-4o-mini";

function stripBrackets(text: string): string {
  return text.trim().replace(/^[「『"']+|[」』"']+$/g, "").trim();
}

export type SkillNamePromptInput = {
  provinceName: string;
  rarity: string;
  loreExcerpt?: string | null;
};

// 05/06番ガイドの「実在の人物名をプロンプトに含めない」方針を踏襲し、武将名は使わず
// 国名・レアリティ・逸話の雰囲気だけから技名を考えさせる。
export async function generateSkillName(input: SkillNamePromptInput): Promise<string> {
  const settings = await getAiImageSettings();
  if (!settings.api_key) {
    throw new AiTextGenerationError("OpenAIのAPIキーが未設定です。管理画面の「AI画像生成設定」で設定してください。", 400);
  }

  const prompt = `戦国時代をテーマにしたカードゲームの必殺技名を1つだけ考えてください。
- レアリティ: ${input.rarity}(格が高いほど壮大で強そうな技名にしてください)
- 出身国: ${input.provinceName}
${input.loreExcerpt ? `- 参考の逸話: ${input.loreExcerpt}` : ""}

制約:
- 日本語で5〜10文字程度の短い技名のみを1つ出力してください
- 説明文・記号・カギ括弧・番号付けは不要です。技名の文字列だけを返してください
- 実在の人物名は使わないでください`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 30,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    const message = body?.error?.message ?? `テキスト生成APIがエラーを返しました(status=${response.status})`;
    throw new AiTextGenerationError(message, response.status || 502);
  }

  const raw = body?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new AiTextGenerationError("テキスト生成APIから内容が返されませんでした。", 502);
  }

  return stripBrackets(raw);
}
