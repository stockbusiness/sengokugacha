"use client";

import { useEffect, useState } from "react";

type AiImageSettingsView = {
  id: string | null;
  provider: "openai" | "gemini";
  api_key_set: boolean;
  api_key_last4: string | null;
  model: string;
  gemini_api_key_set: boolean;
  gemini_api_key_last4: string | null;
  gemini_model: string;
  style_prompt_template: string | null;
  warlord_reference_image_url: string | null;
  metaverse_reference_image_url: string | null;
  enabled_for_warlords: boolean;
  enabled_for_metaverse: boolean;
};

export default function AiImageSettingsPage() {
  const [data, setData] = useState<AiImageSettingsView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  function load() {
    return fetch("/api/admin/ai-image-settings")
      .then((res) => res.json())
      .then((body: AiImageSettingsView) => {
        setData(body);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    if (!data) return;
    setStatus("saving");
    setMessage(null);

    try {
      const res = await fetch("/api/admin/ai-image-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: data.provider,
          api_key: apiKey,
          model: data.model,
          gemini_api_key: geminiApiKey,
          gemini_model: data.gemini_model,
          style_prompt_template: data.style_prompt_template,
          enabled_for_warlords: data.enabled_for_warlords,
          enabled_for_metaverse: data.enabled_for_metaverse,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "保存に失敗しました。");
      setApiKey("");
      setGeminiApiKey("");
      await load();
      setMessage("保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setStatus("ready");
    }
  }

  async function handleReferenceUpload(target: "warlord" | "metaverse", file: File) {
    setUploadingKey(target);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("target", target);
      const res = await fetch("/api/admin/ai-image-settings/reference-image", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "アップロードに失敗しました。");
      await load();
      setMessage("参照画像を更新しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "アップロードに失敗しました。");
    } finally {
      setUploadingKey(null);
    }
  }

  if (status === "loading" || !data) return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">AI画像生成設定</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          武将カード画像・城下町デジタル内覧の各種画像を、OpenAIまたはGoogle Geminiの画像生成APIで作成できるようにする設定です。
          「同じ人物・建物として再現する」再現性を重視する場合はGeminiの方が強いという報告が多く、画風の作り込みや
          プロンプト追従性を重視する場合はOpenAIが安定しています。両方のAPIキーを設定しておき、下の「使用するAPI」で
          切り替えて試すこともできます。ここで設定した共通スタイル文・参照画像は、各生成画面で自動的に使われます。
          実際の生成操作は武将マスタ・メタバース内覧の各管理画面から行います。
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">使用するAPI</p>
        <div className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={data.provider === "openai"}
              onChange={() => setData({ ...data, provider: "openai" })}
            />
            OpenAI(gpt-image-1)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={data.provider === "gemini"}
              onChange={() => setData({ ...data, provider: "gemini" })}
            />
            Google Gemini(2.5 Flash Image)
          </label>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">OpenAI</p>
        <Field label={`APIキー ${data.api_key_set ? `(設定済み: ****${data.api_key_last4})` : "(未設定)"}`}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field label="モデル">
          <input
            type="text"
            value={data.model}
            onChange={(e) => setData({ ...data, model: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Google Gemini</p>
        <Field label={`APIキー ${data.gemini_api_key_set ? `(設定済み: ****${data.gemini_api_key_last4})` : "(未設定)"}`}>
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <Field label="モデル">
          <input
            type="text"
            value={data.gemini_model}
            onChange={(e) => setData({ ...data, gemini_model: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          Geminiはアスペクト比(正方形指定等)を直接指定できないため、各生成画面のプロンプト文の指示に従います。
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <Field label="共通スタイルプロンプト(毎回自動で先頭に付加されます)">
          <textarea
            value={data.style_prompt_template ?? ""}
            onChange={(e) => setData({ ...data, style_prompt_template: e.target.value })}
            rows={6}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">基準参照画像(画風統一用)</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          「全体のスタイル基準を使う」を選んで生成した場合に、この画像を参照して生成します。
          既存の完成品(公式リファレンス画像)を設定してください。
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReferenceImageSlot
            label="武将カード用"
            imageUrl={data.warlord_reference_image_url}
            uploading={uploadingKey === "warlord"}
            onUpload={(file) => handleReferenceUpload("warlord", file)}
          />
          <ReferenceImageSlot
            label="城下町内覧用"
            imageUrl={data.metaverse_reference_image_url}
            uploading={uploadingKey === "metaverse"}
            onUpload={(file) => handleReferenceUpload("metaverse", file)}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">有効化</p>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={data.enabled_for_warlords}
            onChange={(e) => setData({ ...data, enabled_for_warlords: e.target.checked })}
          />
          武将カード画像の生成を有効にする
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={data.enabled_for_metaverse}
            onChange={(e) => setData({ ...data, enabled_for_metaverse: e.target.checked })}
          />
          城下町デジタル内覧画像の生成を有効にする
        </label>
      </div>

      {message && <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>}

      <button
        onClick={handleSave}
        disabled={status === "saving"}
        className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
      >
        {status === "saving" ? "保存中..." : "保存"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  );
}

function ReferenceImageSlot({
  label,
  imageUrl,
  uploading,
  onUpload,
}: {
  label: string;
  imageUrl: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="mb-2 h-24 w-full rounded-md object-cover" />
      ) : (
        <div className="mb-2 flex h-24 w-full items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-900">
          未設定
        </div>
      )}
      <label className="cursor-pointer rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
        {uploading ? "アップロード中..." : "画像を選択"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
