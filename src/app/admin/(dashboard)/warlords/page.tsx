"use client";

import { useEffect, useMemo, useState } from "react";
import AiImageGeneratePanel from "@/components/admin/AiImageGeneratePanel";
import { toDisplayUrl } from "@/lib/image-url";

type Warlord = {
  id: string;
  province_id: string;
  name: string;
  rarity: string;
  slot_type: "common" | "mid" | "rare";
  stats_json: Record<string, number>;
  lore: string | null;
  skill_name: string | null;
  image_url: string | null;
  gacha_reveal_animation_url: string | null;
  tenka_toitsu_image_url: string | null;
  provinces: { id: string; name: string; display_order: number | null } | null;
};

const SLOT_ORDER: Record<Warlord["slot_type"], number> = { common: 0, mid: 1, rare: 2 };
const SLOT_LABEL: Record<Warlord["slot_type"], string> = { common: "コモン枠", mid: "中間枠", rare: "レア枠" };

// 05/06番ガイドのレアリティ別演出差を自動プロンプトの元にする。実名は使わず外見の特徴のみを記述する。
const SLOT_PROMPT: Record<Warlord["slot_type"], string> = {
  common: "素朴で落ち着いた表情、装飾は控えめな簡素な鎧を身につけた、日本の戦国時代の足軽級の武将",
  mid: "貫禄のある表情で、鎧に金の装飾を加えた、日本の戦国時代の武将級の武将",
  rare: "鋭い眼光で躍動感のあるポーズを取り、豪華な金の装飾と背景の家紋・城のシルエットを配した、日本の戦国時代の大名格の武将",
};

function buildWarlordAutoPrompt(warlord: Warlord): string {
  const provinceName = warlord.provinces?.name ?? "";
  return `${provinceName}にゆかりのある、${SLOT_PROMPT[warlord.slot_type]}の縦長の肖像画を描いてください。武将の実名は使用せず、外見の特徴のみで表現してください。`;
}

export default function WarlordsPage() {
  const [warlords, setWarlords] = useState<Warlord[]>([]);
  const [statsDraft, setStatsDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [generatingSkillId, setGeneratingSkillId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/warlords")
      .then((res) => res.json())
      .then((data: Warlord[]) => {
        setWarlords(data);
        setStatsDraft(Object.fromEntries(data.map((w) => [w.id, JSON.stringify(w.stats_json)])));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const grouped = useMemo(() => {
    const byProvince = new Map<string, Warlord[]>();
    for (const w of warlords) {
      const key = w.provinces?.id ?? w.province_id;
      if (!byProvince.has(key)) byProvince.set(key, []);
      byProvince.get(key)!.push(w);
    }
    return [...byProvince.values()]
      .map((group) => group.sort((a, b) => SLOT_ORDER[a.slot_type] - SLOT_ORDER[b.slot_type]))
      .sort((a, b) => (a[0].provinces?.display_order ?? 0) - (b[0].provinces?.display_order ?? 0));
  }, [warlords]);

  function updateField<K extends keyof Warlord>(id: string, key: K, value: Warlord[K]) {
    setWarlords((prev) => prev.map((w) => (w.id === id ? { ...w, [key]: value } : w)));
  }

  async function handleSave(warlord: Warlord) {
    setSavingId(warlord.id);
    setMessageById((prev) => ({ ...prev, [warlord.id]: "" }));

    let statsJson: unknown;
    try {
      statsJson = JSON.parse(statsDraft[warlord.id] ?? "{}");
    } catch {
      setMessageById((prev) => ({ ...prev, [warlord.id]: "ステータスのJSON形式が不正です" }));
      setSavingId(null);
      return;
    }

    try {
      const res = await fetch(`/api/admin/warlords/${warlord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: warlord.name,
          rarity: warlord.rarity,
          lore: warlord.lore,
          skill_name: warlord.skill_name,
          stats_json: statsJson,
          image_url: warlord.image_url,
          gacha_reveal_animation_url: warlord.gacha_reveal_animation_url,
          tenka_toitsu_image_url: warlord.tenka_toitsu_image_url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました。");
      setMessageById((prev) => ({ ...prev, [warlord.id]: "保存しました" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [warlord.id]: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleImageUpload(warlord: Warlord, file: File) {
    setUploadingId(warlord.id);
    setMessageById((prev) => ({ ...prev, [warlord.id]: "" }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/warlords/${warlord.id}/image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "画像のアップロードに失敗しました。");
      updateField(warlord.id, "image_url", data.image_url as string);
      setMessageById((prev) => ({ ...prev, [warlord.id]: "画像をアップロードしました" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [warlord.id]: error instanceof Error ? error.message : "画像のアップロードに失敗しました。",
      }));
    } finally {
      setUploadingId(null);
    }
  }

  // 画像生成と同じく、生成しただけではDBに保存しない(欄に反映するのみ)。反映後に
  // 内容を確認・編集してから、通常の「保存」ボタンで確定する。
  async function handleGenerateSkillName(warlord: Warlord) {
    setGeneratingSkillId(warlord.id);
    setMessageById((prev) => ({ ...prev, [warlord.id]: "" }));
    try {
      const res = await fetch(`/api/admin/warlords/${warlord.id}/skill-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persist: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "スキル名の生成に失敗しました。");
      updateField(warlord.id, "skill_name", data.skill_name as string);
      setMessageById((prev) => ({ ...prev, [warlord.id]: "スキル名を生成しました(「保存」を押すまで確定しません)" }));
    } catch (error) {
      setMessageById((prev) => ({
        ...prev,
        [warlord.id]: error instanceof Error ? error.message : "スキル名の生成に失敗しました。",
      }));
    } finally {
      setGeneratingSkillId(null);
    }
  }

  // 一括生成は75体分を1件ずつ確認する運用が非現実的なため、生成と同時に保存する
  // (persist: true)。1件ずつ順番に呼ぶのは、サーバーレス関数のタイムアウトを避けるため
  // クライアント側でループする設計にしているため。
  async function handleGenerateMissingSkillNames() {
    const targets = warlords.filter((w) => !w.skill_name);
    if (targets.length === 0) return;
    setBatchProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      try {
        const res = await fetch(`/api/admin/warlords/${targets[i].id}/skill-name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persist: true }),
        });
        const data = await res.json();
        if (res.ok) updateField(targets[i].id, "skill_name", data.skill_name as string);
      } catch {
        // 1件失敗しても続行し、未設定分は個別の「AIで生成」で後から補う。
      }
      setBatchProgress({ done: i + 1, total: targets.length });
    }
    setBatchProgress(null);
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">武将マスタ({warlords.length}体)</h1>
      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        国・スロット(コモン/中間/レア)の組み替えはガチャ抽選ロジックの前提を崩すため、管理画面からは変更できません。
        「レアリティ」は表示名の自由入力欄で、抽選確率はスロット(コモン/中間/レア)側で決まります(「排出率設定」ページ参照)。
        表示名とスロットがずれないよう、既存の値(足軽級/武将級/大名級など)に揃えてください。
      </p>

      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <button
          onClick={handleGenerateMissingSkillNames}
          disabled={batchProgress !== null}
          className="rounded-lg border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-400 dark:text-red-400 dark:hover:bg-red-950"
        >
          {batchProgress ? `生成中... (${batchProgress.done}/${batchProgress.total})` : "未設定のスキル名をAIで一括生成"}
        </button>
        <span className="text-xs text-zinc-400 dark:text-zinc-600">
          スキル名が未設定の武将だけを対象に、1件ずつ生成してそのまま保存します(AI画像生成設定のOpenAI APIキーを使用)。
          個別の「AIで生成」ボタンは、確認・編集してから「保存」を押すまで確定しません。
        </span>
      </div>

      {grouped.map((group) => (
        <section
          key={group[0].provinces?.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {group[0].provinces?.name ?? "(不明な国)"}
          </h2>
          <div className="space-y-4">
            {group.map((w) => (
              <div key={w.id} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                <p className="mb-2 text-xs font-medium text-zinc-400">{SLOT_LABEL[w.slot_type]}</p>
                <div className="flex flex-wrap items-end gap-3">
                  <TextField label="武将名" value={w.name} onChange={(v) => updateField(w.id, "name", v)} />
                  <TextField label="レアリティ" value={w.rarity} onChange={(v) => updateField(w.id, "rarity", v)} />
                  <TextField
                    label="画像URL"
                    value={w.image_url ?? ""}
                    onChange={(v) => updateField(w.id, "image_url", v || null)}
                  />
                </div>

                <div className="mt-2 flex items-center gap-3">
                  {w.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={toDisplayUrl(w.image_url) ?? undefined}
                      alt={w.name}
                      className="h-16 w-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                    />
                  )}
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      画像をアップロード(自動でLINE表示用にリサイズされます)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingId === w.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) handleImageUpload(w, file);
                      }}
                      className="block text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
                    />
                    {uploadingId === w.id && (
                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        アップロード中...
                      </span>
                    )}
                  </label>
                </div>

                <AiImageGeneratePanel
                  entityType="warlord"
                  entityId={w.id}
                  autoPrompt={buildWarlordAutoPrompt(w)}
                  currentImageUrl={w.image_url}
                  onAdopted={(url) => updateField(w.id, "image_url", url)}
                />

                <div className="mt-2">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    スキル名(カード画像に合成されます)
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={w.skill_name ?? ""}
                      onChange={(e) => updateField(w.id, "skill_name", e.target.value || null)}
                      placeholder="例: 吹雪の槍列"
                      className="flex-1 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                    <button
                      onClick={() => handleGenerateSkillName(w)}
                      disabled={generatingSkillId === w.id}
                      className="rounded-lg border border-red-700 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-400 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      {generatingSkillId === w.id ? "生成中..." : "AIで生成"}
                    </button>
                  </div>
                </div>

                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">逸話</span>
                  <textarea
                    value={w.lore ?? ""}
                    onChange={(e) => updateField(w.id, "lore", e.target.value || null)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    rows={2}
                  />
                </label>
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    ステータス(JSON、将来用・現在ゲーム画面には表示されません)
                  </span>
                  <input
                    type="text"
                    value={statsDraft[w.id] ?? ""}
                    onChange={(e) => setStatsDraft((prev) => ({ ...prev, [w.id]: e.target.value }))}
                    placeholder='例: {"attack": 80, "defense": 60}'
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
                    {"{ }"}で囲んだ「項目名: 数値」の組み合わせで入力してください。空欄でよければ{"{}"}のままにしてください。
                  </span>
                </label>

                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={() => handleSave(w)}
                    disabled={savingId === w.id}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {savingId === w.id ? "保存中..." : "保存"}
                  </button>
                  {messageById[w.id] && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{messageById[w.id]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}
