import { getAiImageSettings, type AiImageSettings } from "@/lib/ai-image-settings";
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

type GeminiInlineData = { mimeType?: string; mime_type?: string; data?: string };
type GeminiPart = { inlineData?: GeminiInlineData; inline_data?: GeminiInlineData };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string };
};

async function fetchReferenceImage(referenceImageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const refRes = await fetch(referenceImageUrl);
  if (!refRes.ok) {
    throw new AiImageGenerationError(`参照画像の取得に失敗しました(status=${refRes.status})`, 400);
  }
  const buffer = Buffer.from(await refRes.arrayBuffer());
  const contentType = refRes.headers.get("content-type") ?? "image/webp";
  return { buffer, contentType };
}

async function generateWithOpenAi(
  settings: AiImageSettings,
  fullPrompt: string,
  referenceImageUrl: string | null,
  size: AiImageSize
): Promise<Buffer> {
  if (!settings.api_key) {
    throw new AiImageGenerationError("OpenAIのAPIキーが未設定です。管理画面の「AI画像生成設定」で設定してください。", 400);
  }

  let response: Response;
  if (referenceImageUrl) {
    const { buffer, contentType } = await fetchReferenceImage(referenceImageUrl);
    const formData = new FormData();
    formData.append("model", settings.model);
    formData.append("prompt", fullPrompt);
    formData.append("size", size);
    formData.append("image", new Blob([new Uint8Array(buffer)], { type: contentType }), "reference.webp");

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

// Gemini(2.5 Flash Image、通称Nano Banana)。複数ターンにわたる被写体の同一性維持に
// 強いとされ、「同じ人物・建物として再現する」用途ではOpenAIより有力な選択肢になり得る。
// サイズ(アスペクト比)を直接指定するパラメータは無いため、正方形指定等はプロンプト文面
// (呼び出し側のautoPromptで「正方形の構図で」等を明記)に委ねる。
async function generateWithGemini(
  settings: AiImageSettings,
  fullPrompt: string,
  referenceImageUrl: string | null
): Promise<Buffer> {
  if (!settings.gemini_api_key) {
    throw new AiImageGenerationError("GeminiのAPIキーが未設定です。管理画面の「AI画像生成設定」で設定してください。", 400);
  }

  const parts: Record<string, unknown>[] = [{ text: fullPrompt }];
  if (referenceImageUrl) {
    const { buffer, contentType } = await fetchReferenceImage(referenceImageUrl);
    parts.push({ inline_data: { mime_type: contentType, data: buffer.toString("base64") } });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.gemini_model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"] } }),
    }
  );

  const body = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!response.ok || !body) {
    const message = body?.error?.message ?? `画像生成APIがエラーを返しました(status=${response.status})`;
    throw new AiImageGenerationError(message, response.status || 502);
  }

  const responseParts = body.candidates?.[0]?.content?.parts ?? [];
  const imagePart = responseParts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const b64 = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
  if (!b64) {
    throw new AiImageGenerationError("画像生成APIから画像データが返されませんでした。", 502);
  }

  return Buffer.from(b64, "base64");
}

// 05/06番ガイドの「参考画像+共通スタイル指示+個別特徴」の3点セットをそのままAPI化する。
// style_prompt_templateは毎回プロンプトの先頭に自動付加される。providerによってOpenAI/Geminiを
// 呼び分けるが、呼び出し側(APIルート)はこの関数だけを見ればよい。
export async function generateImage(prompt: string, options?: GenerateImageOptions): Promise<Buffer> {
  const settings = await getAiImageSettings();
  const fullPrompt = settings.style_prompt_template ? `${settings.style_prompt_template}\n\n${prompt}` : prompt;
  const size = options?.size ?? "1024x1024";
  const referenceImageUrl = options?.referenceImageUrl ?? null;

  if (settings.provider === "gemini") {
    return generateWithGemini(settings, fullPrompt, referenceImageUrl);
  }
  return generateWithOpenAi(settings, fullPrompt, referenceImageUrl, size);
}
