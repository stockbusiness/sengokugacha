"use client";

import { useState } from "react";

type AiImageEntityType = "warlord" | "metaverse_area" | "metaverse_property" | "metaverse_scene" | "metaverse_map";
type UseReference = "none" | "style" | "current";
type PanelState = "idle" | "editing" | "generating" | "previewing" | "adopting";

type Props = {
  entityType: AiImageEntityType;
  entityId: string;
  target?: string;
  autoPrompt: string;
  currentImageUrl?: string | null;
  onAdopted: (imageUrl: string) => void;
};

export default function AiImageGeneratePanel({ entityType, entityId, target, autoPrompt, currentImageUrl, onAdopted }: Props) {
  const [state, setState] = useState<PanelState>("idle");
  const [prompt, setPrompt] = useState(autoPrompt);
  const [useReference, setUseReference] = useState<UseReference>("style");
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleGenerate() {
    if (!window.confirm("AI画像を生成します。API利用料が発生する場合があります。よろしいですか?")) return;

    setState("generating");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/ai-image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, target, prompt, use_reference: useReference }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "生成に失敗しました。");
      setPreviewBase64(body.image_base64);
      setGenerationId(body.generation_id);
      if (body.fallback_used) {
        setNotice(`設定中のAPIが利用できなかったため、${body.provider_used === "gemini" ? "Gemini" : "OpenAI"}で生成しました。`);
      }
      setState("previewing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "予期しないエラーが発生しました。");
      setState("editing");
    }
  }

  async function handleAdopt() {
    if (!generationId || !previewBase64) return;
    setState("adopting");
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-image/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation_id: generationId, image_base64: previewBase64 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "採用に失敗しました。");
      onAdopted(body.image_url as string);
      handleCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "予期しないエラーが発生しました。");
      setState("previewing");
    }
  }

  function handleCancel() {
    setState("idle");
    setPreviewBase64(null);
    setGenerationId(null);
    setError(null);
    setNotice(null);
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("editing")}
        className="rounded-lg border border-red-700 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-400 dark:text-red-400 dark:hover:bg-red-950"
      >
        AIで画像を生成
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      {(state === "editing" || state === "generating") && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">プロンプト</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              disabled={state === "generating"}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <label className="flex items-center gap-1">
              <input type="radio" checked={useReference === "none"} onChange={() => setUseReference("none")} disabled={state === "generating"} />
              参照画像なし
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={useReference === "style"} onChange={() => setUseReference("style")} disabled={state === "generating"} />
              全体のスタイル基準を使う
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={useReference === "current"}
                onChange={() => setUseReference("current")}
                disabled={state === "generating" || !currentImageUrl}
              />
              現在の画像を参照する(同じ人物・建物として再現)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={state === "generating" || !prompt.trim()}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {state === "generating" ? "生成中..." : "生成する"}
            </button>
            <button type="button" onClick={handleCancel} disabled={state === "generating"} className="text-xs text-zinc-500 hover:underline disabled:opacity-50">
              キャンセル
            </button>
          </div>
        </>
      )}

      {(state === "previewing" || state === "adopting") && previewBase64 && (
        <>
          {notice && <p className="text-xs text-amber-600 dark:text-amber-400">{notice}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${previewBase64}`} alt="生成プレビュー" className="max-h-64 w-full rounded-lg object-contain" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdopt}
              disabled={state === "adopting"}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {state === "adopting" ? "採用中..." : "採用する"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewBase64(null);
                setGenerationId(null);
                setState("editing");
              }}
              disabled={state === "adopting"}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              再生成
            </button>
            <button type="button" onClick={handleCancel} disabled={state === "adopting"} className="text-xs text-zinc-500 hover:underline disabled:opacity-50">
              キャンセル
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
