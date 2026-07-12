import { getAiImageSettings } from "@/lib/ai-image-settings";
import type { AiImageSize } from "@/lib/ai-image-targets";

export class AiImageGenerationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type GenerateImageOptions = {
  referenceImageUrl?: string | null;
  size?: AiImageSize;
};

type OpenAiImageResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
};

// 06_chatgpt_image_guide_v1.0.mdの「参考画像+共通スタイル指示+個別特徴」の3点セットを
// そのままAPI化する。style_prompt_templateは毎回プロンプトの先頭に自動付加される。
export async function generateImage(prompt: string, options?: GenerateImageOptions): Promise<Buffer> {
  const settings = await getAiImageSettings();
  if (!settings.api_key) {
    throw new AiImageGenerationError("AI画像生成のAPIキーが未設定です。管理画面の「AI画像生成設定」で設定してください。", 400);
  }

  const fullPrompt = settings.style_prompt_template ? `${settings.style_prompt_template}\n\n${prompt}` : prompt;
  const size = options?.size ?? "1024x1024";
  const referenceImageUrl = options?.referenceImageUrl ?? null;

  let response: Response;
  if (referenceImageUrl) {
    const refRes = await fetch(referenceImageUrl);
    if (!refRes.ok) {
      throw new AiImageGenerationError(`参照画像の取得に失敗しました(status=${refRes.status})`, 400);
    }
    const refBuffer = Buffer.from(await refRes.arrayBuffer());
    const refType = refRes.headers.get("content-type") ?? "image/webp";

    const formData = new FormData();
    formData.append("model", settings.model);
    formData.append("prompt", fullPrompt);
    formData.append("size", size);
    formData.append("image", new Blob([refBuffer], { type: refType }), "reference.webp");

    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.api_key}` },
      body: formData,
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: settings.model, prompt: fullPrompt, size, response_format: "b64_json" }),
    });
  }

  const body = (await response.json().catch(() => null)) as OpenAiImageResponse | null;
  if (!response.ok || !body) {
    const message = body?.error?.message ?? `画像生成APIがエラーを返しました(status=${response.status})`;
    throw new AiImageGenerationError(message, response.status || 502);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (!b64) {
    throw new AiImageGenerationError("画像生成APIから画像データが返されませんでした。", 502);
  }

  return Buffer.from(b64, "base64");
}
