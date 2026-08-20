"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Course = { id: string; code: string; title: string; description: string | null; status: string; starts_at: string | null; ends_at: string | null };

type Mission = {
  id: string;
  code: string;
  title: string;
  display_order: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  require_content_viewed: boolean;
  require_all_questions_answered: boolean;
  min_correct_answers: number;
  require_external_achievement: boolean;
  allow_self_report: boolean;
  reward_amount: number;
  self_report_reward_amount: number | null;
  publishedVersion: number | null;
  draftVersion: number | null;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "下書き" },
  { value: "published", label: "公開中" },
  { value: "suspended", label: "停止中" },
];

// datetime-local の値とISO文字列を相互変換する。
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export default function AdminJourneyCoursePage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  // 既存の管理画面(CastlePlotsSection等)と同じ形に揃えている。asyncのままeffectから
  // 呼ぶと react-hooks/set-state-in-effect に引っかかるため、promiseチェーンで書く。
  function load() {
    return Promise.all([
      fetch("/api/admin/journey/courses").then((res) => res.json()),
      fetch(`/api/admin/journey/missions?courseId=${id}`).then((res) => res.json()),
    ]).then(([courses, missionRows]: [Course[], Mission[]]) => {
      setCourse(courses.find((c) => c.id === id) ?? null);
      setMissions(Array.isArray(missionRows) ? missionRows : []);
      setStatus("ready");
    });
  }

  useEffect(() => {
    load().catch(() => setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patchCourse(fields: Record<string, unknown>) {
    setMessage(null);
    const res = await fetch(`/api/admin/journey/courses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "更新に失敗しました。");
      return;
    }
    await load();
  }

  async function patchMission(missionId: string, fields: Record<string, unknown>) {
    setSavingId(missionId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/journey/missions/${missionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "更新に失敗しました。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreateMission(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/admin/journey/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: id, code, title }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "作成に失敗しました。");
      return;
    }
    setCode("");
    setTitle("");
    await load();
  }

  // 並び替えは display_order の入れ替えで行う(2件分のPATCH)。
  async function move(mission: Mission, direction: -1 | 1) {
    const sorted = [...missions].sort((a, b) => a.display_order - b.display_order);
    const index = sorted.findIndex((m) => m.id === mission.id);
    const target = sorted[index + direction];
    if (!target) return;
    await patchMission(mission.id, { display_order: target.display_order });
    await patchMission(target.id, { display_order: mission.display_order });
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !course) return <p className="text-red-700 dark:text-red-400">コースが見つかりません。</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/journey/courses" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← コース管理
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">{course.title}</h1>
      </div>

      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{message}</p>}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">コースの公開設定</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">公開状態</span>
            <select
              value={course.status}
              onChange={(e) => patchCourse({ status: e.target.value })}
              className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">公開開始</span>
            <input type="datetime-local" defaultValue={toLocalInput(course.starts_at)}
              onBlur={(e) => patchCourse({ starts_at: fromLocalInput(e.target.value) })}
              className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">公開終了</span>
            <input type="datetime-local" defaultValue={toLocalInput(course.ends_at)}
              onBlur={(e) => patchCourse({ ends_at: fromLocalInput(e.target.value) })}
              className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          「停止中」への変更は本部管理者のみ行えます。停止しても回答・進捗・完了の記録は消えません。
        </p>
      </div>

      <form onSubmit={handleCreateMission} className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">コード</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="M1"
            className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">タイトル</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="千ノ国とは何か"
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
        </label>
        <button type="submit" disabled={!code.trim() || !title.trim()}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          ミッションを追加
        </button>
      </form>

      <div className="space-y-3">
        {missions.map((mission, index) => (
          <div key={mission.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {index + 1}. {mission.title} <span className="font-mono text-xs text-zinc-500">{mission.code}</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {mission.publishedVersion
                    ? `公開中の教材: v${mission.publishedVersion}`
                    : "教材が未公開のため参加者には出ません"}
                  {mission.draftVersion ? ` / 下書き: v${mission.draftVersion}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => move(mission, -1)} disabled={index === 0 || savingId !== null}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300">↑</button>
                <button onClick={() => move(mission, 1)} disabled={index === missions.length - 1 || savingId !== null}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300">↓</button>
                <select value={mission.status} onChange={(e) => patchMission(mission.id, { status: e.target.value })}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <Link href={`/admin/journey/missions/${mission.id}`}
                  className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
                  教材・設問
                </Link>
              </div>
            </div>

            {/* 完了条件と付与予定数(指示書§4.2) */}
            <div className="mt-3 grid gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-2 dark:border-zinc-800">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">完了条件</p>
                {[
                  { key: "require_content_viewed", label: "教材の表示を必須にする" },
                  { key: "require_all_questions_answered", label: "必須設問への回答を必須にする" },
                  { key: "require_external_achievement", label: "体験の実績を必須にする" },
                  { key: "allow_self_report", label: "実績が確認できない場合、自己申告を認める" },
                ].map((flag) => (
                  <label key={flag.key} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <input type="checkbox" checked={mission[flag.key as keyof Mission] as boolean}
                      onChange={(e) => patchMission(mission.id, { [flag.key]: e.target.checked })} />
                    {flag.label}
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">必要な正解数（0なら不要）</span>
                  <input type="number" defaultValue={mission.min_correct_answers}
                    onBlur={(e) => patchMission(mission.id, { min_correct_answers: Number(e.target.value) })}
                    className="w-24 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">特典と公開期間</p>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">付与予定数</span>
                  <input type="number" defaultValue={mission.reward_amount}
                    onBlur={(e) => patchMission(mission.id, { reward_amount: Number(e.target.value) })}
                    className="w-32 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                    自己申告での付与数（空欄なら同額、0なら対象外）
                  </span>
                  <input type="number" defaultValue={mission.self_report_reward_amount ?? ""}
                    onBlur={(e) => patchMission(mission.id, { self_report_reward_amount: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-32 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
                </label>
                <div className="flex gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">公開開始</span>
                    <input type="datetime-local" defaultValue={toLocalInput(mission.starts_at)}
                      onBlur={(e) => patchMission(mission.id, { starts_at: fromLocalInput(e.target.value) })}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">公開終了</span>
                    <input type="datetime-local" defaultValue={toLocalInput(mission.ends_at)}
                      onBlur={(e) => patchMission(mission.id, { ends_at: fromLocalInput(e.target.value) })}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        ))}
        {missions.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">まだミッションがありません。</p>}
      </div>
    </div>
  );
}
