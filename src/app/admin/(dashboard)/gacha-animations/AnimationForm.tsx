"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toDisplayUrl } from "@/lib/image-url";

export type AnimationFormValues = {
  animation_key: string;
  name: string;
  description: string;
  rarity: string;
  status: string;
  only_new_card: boolean;
  allow_skip: boolean;
  skip_after_ms: number;
  minimum_play_ms: number;
  is_default: boolean;
  priority: number;
  weight: number;
  starts_at: string;
  ends_at: string;
};

const DEFAULT_VALUES: AnimationFormValues = {
  animation_key: "",
  name: "",
  description: "",
  rarity: "ANY",
  status: "draft",
  only_new_card: false,
  allow_skip: true,
  skip_after_ms: 1000,
  minimum_play_ms: 0,
  is_default: false,
  priority: 0,
  weight: 100,
  starts_at: "",
  ends_at: "",
};

export function AnimationForm({
  mode,
  animationId,
  initialValues,
  currentVideoUrl,
  currentPosterUrl,
}: {
  mode: "create" | "edit";
  animationId?: string;
  initialValues?: Partial<AnimationFormValues>;
  currentVideoUrl?: string | null;
  currentPosterUrl?: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<AnimationFormValues>({ ...DEFAULT_VALUES, ...initialValues });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof AnimationFormValues>(key: K, value: AnimationFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      if (mode === "create") formData.append("animation_key", values.animation_key);
      formData.append("name", values.name);
      formData.append("description", values.description);
      formData.append("rarity", values.rarity);
      formData.append("status", values.status);
      formData.append("only_new_card", String(values.only_new_card));
      formData.append("allow_skip", String(values.allow_skip));
      formData.append("skip_after_ms", String(values.skip_after_ms));
      formData.append("minimum_play_ms", String(values.minimum_play_ms));
      formData.append("is_default", String(values.is_default));
      formData.append("priority", String(values.priority));
      formData.append("weight", String(values.weight));
      if (values.starts_at) formData.append("starts_at", new Date(values.starts_at).toISOString());
      if (values.ends_at) formData.append("ends_at", new Date(values.ends_at).toISOString());
      if (videoFile) formData.append("video", videoFile);
      if (posterFile) formData.append("poster", posterFile);

      if (mode === "create") {
        if (!videoFile) throw new Error("動画ファイルを選択してください。");
        const res = await fetch("/api/admin/gacha-animations", { method: "POST", body: formData });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "登録に失敗しました。");
      } else {
        const res = await fetch(`/api/admin/gacha-animations/${animationId}`, { method: "PATCH", body: formData });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "更新に失敗しました。");
      }

      router.push("/admin/gacha-animations");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "予期しないエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-semibold">動画の選ばれ方(このページで一番わかりにくい部分です)</p>
        <p className="mt-1">
          ガチャを引いた瞬間、まず「状態=公開」かつ「レアリティが一致」かつ「公開期間内」の動画だけが候補になります。
          候補が複数ある場合は、その中で「優先度」の数値が最も高いものだけに絞り込み、さらに複数残っていれば
          「weight」の比率でランダムに1本を選びます(weightが大きいほど選ばれやすい、100:50なら約2:1の確率)。
          該当する動画が1本も無い場合は「デフォルト動画にする」にチェックが付いた動画にフォールバックします。
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">基本情報</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            animationKey{mode === "edit" && "(変更不可)"}
          </span>
          <input
            type="text"
            required
            disabled={mode === "edit"}
            value={values.animation_key}
            onChange={(e) => update("animation_key", e.target.value)}
            placeholder="例: rare_single"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
            他の動画と重複しない管理用の識別名です(ローマ字・アンダースコア推奨)。登録後は変更できません。
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">動画名</span>
          <input
            type="text"
            required
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">説明</span>
          <textarea
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">状態</span>
          <select
            value={values.status}
            onChange={(e) => update("status", e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="draft">下書き</option>
            <option value="published">公開</option>
            <option value="stopped">停止</option>
          </select>
          <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
            「公開」にするまでガチャでは再生されません。「停止」は一時的に外したいときに使います(削除ではありません)。
          </span>
        </label>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">適用条件</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            レアリティ(足軽級/武将級/大名級)
          </span>
          <select
            value={values.rarity}
            onChange={(e) => update("rarity", e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="ANY">共通(すべてのレアリティ)</option>
            <option value="common">足軽級</option>
            <option value="mid">武将級</option>
            <option value="rare">大名級</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.only_new_card}
            onChange={(e) => update("only_new_card", e.target.checked)}
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">新規獲得時のみ再生する</span>
        </label>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
          チェックすると、同じ武将を2体目以降引いたとき(すでに図鑑に持っている武将)はこの動画が使われません。
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={values.is_default} onChange={(e) => update("is_default", e.target.checked)} />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            デフォルト動画にする(他に該当が無い場合のフォールバック)
          </span>
        </label>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
          このレアリティで条件に合う動画が他に無いときの保険用です。各レアリティに最低1本、これにチェックの
          付いた動画を用意しておくことをおすすめします。
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">配信設定</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">優先度</span>
            <input
              type="number"
              value={values.priority}
              onChange={(e) => update("priority", Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
              数値が大きいほど優先されます。他の動画と数値が同じ場合のみweightで抽選します。
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">weight(加重ランダム)</span>
            <input
              type="number"
              value={values.weight}
              onChange={(e) => update("weight", Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
              同じ優先度の動画が複数あるときの出現しやすさの比率です。100と50なら約2:1の確率になります。
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">公開開始日時(任意)</span>
            <input
              type="datetime-local"
              value={values.starts_at}
              onChange={(e) => update("starts_at", e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
              空欄なら「状態=公開」にした時点からすぐ対象になります。
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">公開終了日時(任意)</span>
            <input
              type="datetime-local"
              value={values.ends_at}
              onChange={(e) => update("ends_at", e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
              空欄なら期限なしで公開され続けます。期間限定の演出は必ず設定してください。
            </span>
          </label>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">再生・スキップ設定</h2>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={values.allow_skip} onChange={(e) => update("allow_skip", e.target.checked)} />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">スキップを許可する</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">スキップ表示開始(ms)</span>
            <input
              type="number"
              value={values.skip_after_ms}
              onChange={(e) => update("skip_after_ms", Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
              ミリ秒単位です(1000ms=1秒)。再生開始から何秒後に「スキップ」ボタンを表示するかの設定です。
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">最低再生時間(ms)</span>
            <input
              type="number"
              value={values.minimum_play_ms}
              onChange={(e) => update("minimum_play_ms", Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-600">
              ミリ秒単位です。スキップを許可していても、この時間が経過するまではスキップできません。
            </span>
          </label>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">ファイル</h2>

        {currentVideoUrl && (
          <div className="mx-auto w-40">
            <p className="mb-1 text-xs text-zinc-400 dark:text-zinc-600">現在の動画</p>
            <video
              src={currentVideoUrl}
              poster={toDisplayUrl(currentPosterUrl) ?? undefined}
              controls
              muted
              className="aspect-[9/16] w-full rounded-lg border border-zinc-200 bg-black object-cover dark:border-zinc-800"
            />
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            動画ファイル(MP4・9:16縦型・10秒以内)
            {mode === "edit" && "。空欄なら変更しません"}
          </span>
          <input
            type="file"
            accept="video/mp4"
            onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
        </label>

        {currentPosterUrl && (
          <div className="mx-auto w-40">
            <p className="mb-1 text-xs text-zinc-400 dark:text-zinc-600">現在のポスター</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={toDisplayUrl(currentPosterUrl) ?? undefined}
              alt=""
              className="aspect-[9/16] w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
            />
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            ポスター画像(任意。読み込み中・失敗時に表示)
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
      >
        {saving ? "保存中..." : mode === "create" ? "登録" : "更新"}
      </button>
    </form>
  );
}
