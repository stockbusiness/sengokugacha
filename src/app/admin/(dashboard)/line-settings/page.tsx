"use client";

import { useEffect, useState, type ChangeEvent } from "react";

type LineSettings = {
  id: string | null;
  liff_id: string | null;
  channel_id: string | null;
  messaging_channel_access_token_set: boolean;
  messaging_channel_access_token_last4: string | null;
  rich_menu_id: string | null;
  rich_menu_image_url: string | null;
};

type RichMenuPanel = {
  slotIndex: number;
  label: string;
  imageUrl: string;
  isCustomized: boolean;
  updatedAt: string | null;
};

export default function LineSettingsPage() {
  const [settings, setSettings] = useState<LineSettings | null>(null);
  const [liffId, setLiffId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [messagingToken, setMessagingToken] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<"idle" | "deploying">("idle");
  const [deployMessage, setDeployMessage] = useState<string | null>(null);
  const [imageUploadStatus, setImageUploadStatus] = useState<"idle" | "uploading">("idle");
  const [imageUploadMessage, setImageUploadMessage] = useState<string | null>(null);
  const [panels, setPanels] = useState<RichMenuPanel[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);

  function load() {
    return fetch("/api/admin/line-settings")
      .then((res) => res.json())
      .then((data: LineSettings) => {
        setSettings(data);
        setLiffId(data.liff_id ?? "");
        setChannelId(data.channel_id ?? "");
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  function loadPanels() {
    return fetch("/api/admin/rich-menu/panels")
      .then((res) => res.json())
      .then((data: { panels: RichMenuPanel[] }) => setPanels(data.panels ?? []))
      .catch(() => {
        /* パネル一覧の取得失敗はページ全体の表示を妨げない */
      });
  }

  useEffect(() => {
    load();
    loadPanels();
  }, []);

  async function handleSave() {
    setStatus("saving");
    setMessage(null);

    try {
      const res = await fetch("/api/admin/line-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liff_id: liffId,
          channel_id: channelId,
          messaging_channel_access_token: messagingToken,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "保存に失敗しました。");
      setMessagingToken("");
      await load();
      setMessage("保存しました。反映には数秒かかる場合があります。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setStatus("ready");
    }
  }

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImageUploadStatus("uploading");
    setImageUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/rich-menu/image", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "アップロードに失敗しました。");
      setImageUploadMessage("画像をアップロードしました。反映するには下の「リッチメニューをデプロイ」を実行してください。");
      await load();
    } catch (error) {
      setImageUploadMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setImageUploadStatus("idle");
    }
  }

  async function handlePanelUpload(slotIndex: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingSlot(slotIndex);
    setPanelMessage(null);

    try {
      const formData = new FormData();
      formData.append("slot_index", String(slotIndex));
      formData.append("file", file);
      const res = await fetch("/api/admin/rich-menu/panel", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "アップロードに失敗しました。");
      setPanelMessage("このアイコンだけを差し替え、リッチメニュー画像を自動で作り直しました。反映するには下の「リッチメニューをデプロイ」を実行してください。");
      await Promise.all([load(), loadPanels()]);
    } catch (error) {
      setPanelMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleDeployRichMenu() {
    setDeployStatus("deploying");
    setDeployMessage(null);

    try {
      const res = await fetch("/api/admin/rich-menu/deploy", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "デプロイに失敗しました。");
      setDeployMessage(`デプロイ成功(richMenuId: ${body.richMenuId})`);
      await load();
    } catch (error) {
      setDeployMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setDeployStatus("idle");
    }
  }

  if (status === "loading" || !settings) return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">LIFF / LINE設定</h1>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          LINE Developersコンソールで発行したLIFF IDと、そのLIFFが属するLINEログインチャネルのチャネルID。
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">LIFF ID</span>
          <input
            type="text"
            value={liffId}
            onChange={(e) => setLiffId(e.target.value)}
            placeholder="1234567890-xxxxxxxx"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            LINEログイン チャネルID
          </span>
          <input
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="1234567890"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          リッチメニュー(LINE公式アカウント/Messaging API)
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          LIFFログイン用のチャネルとは別に、LINE公式アカウント(Messaging API)のチャネルアクセストークンが必要です。
          空欄のまま保存すると変更されません。
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Messaging API チャネルアクセストークン{" "}
            {settings.messaging_channel_access_token_set
              ? `(設定済み: ****${settings.messaging_channel_access_token_last4})`
              : "(未設定)"}
          </span>
          <input
            type="password"
            value={messagingToken}
            onChange={(e) => setMessagingToken(e.target.value)}
            placeholder="長期チャネルアクセストークン"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
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

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">アイコンを個別に差し替え</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          6つのボタンはそれぞれ独立した画像です。1つだけ変更したい場合は、そのアイコンの下のボタンから画像を選んでください。
          自動でリッチメニュー画像全体(2500×1686px)を作り直します。
        </p>
        <div className="grid grid-cols-3 gap-3">
          {panels.map((panel) => (
            <div key={panel.slotIndex} className="space-y-1.5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={panel.imageUrl}
                alt={panel.label}
                className="aspect-square w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
              />
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{panel.label}</p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-600">
                {panel.isCustomized ? "カスタム画像" : "既定画像"}
              </p>
              <label className="block">
                <span className="sr-only">{panel.label}の画像を変更</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePanelUpload(panel.slotIndex, e)}
                  disabled={uploadingSlot !== null}
                  className="block w-full text-[11px] text-zinc-600 file:mr-1 file:rounded file:border-0 file:bg-zinc-900 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
                />
              </label>
              {uploadingSlot === panel.slotIndex && (
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">アップロード中...</p>
              )}
            </div>
          ))}
          {panels.length === 0 && (
            <p className="col-span-3 text-xs text-zinc-400 dark:text-zinc-600">読み込み中...</p>
          )}
        </div>
        {panelMessage && <p className="text-sm text-zinc-600 dark:text-zinc-300">{panelMessage}</p>}
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">リッチメニューのデプロイ</p>
        <img
          src={settings.rich_menu_image_url ?? "/rich-menu.jpg"}
          alt="リッチメニュー プレビュー"
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
        />
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          パスポート/ガチャ/図鑑/日本地図/購入/遊び方 の6ボタン構成です。ボタンの遷移先を変更したい場合は開発者に依頼してください。
        </p>

        <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
            画像全体を一括で差し替え(上級者向け)
          </summary>
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">画像を差し替え</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={imageUploadStatus === "uploading"}
                className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
              />
            </label>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              自動で2500×1686pxにリサイズ(中央でトリミング)・圧縮されます。この方法で差し替えると、
              上の個別アイコン設定は上書きされます。
            </p>
            {imageUploadStatus === "uploading" && <p className="text-sm text-zinc-600 dark:text-zinc-300">アップロード中...</p>}
            {imageUploadMessage && <p className="text-sm text-zinc-600 dark:text-zinc-300">{imageUploadMessage}</p>}
          </div>
        </details>

        {settings.rich_menu_id && (
          <p className="text-xs text-zinc-400 dark:text-zinc-600">現在のrichMenuId: {settings.rich_menu_id}</p>
        )}
        {deployMessage && <p className="text-sm text-zinc-600 dark:text-zinc-300">{deployMessage}</p>}
        <button
          onClick={handleDeployRichMenu}
          disabled={deployStatus === "deploying" || !settings.messaging_channel_access_token_set}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {deployStatus === "deploying" ? "デプロイ中..." : "リッチメニューをデプロイ"}
        </button>
        {!settings.messaging_channel_access_token_set && (
          <p className="text-xs text-red-700 dark:text-red-400">
            先にチャネルアクセストークンを保存してください。
          </p>
        )}
      </div>
    </div>
  );
}
