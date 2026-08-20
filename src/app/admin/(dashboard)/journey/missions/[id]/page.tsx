"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// 教材バージョンと設問・選択肢の編集。
//
// ADR-3: 公開済みのバージョンは書き換えず、新しい下書きを作って差し替える。
// 公開済みへの書き換えはDBのトリガーが拒否するので、画面側も編集欄を出さない。

type Choice = { id: string; display_order: number; body: string; is_correct: boolean };
type Question = {
  id: string;
  display_order: number;
  question_type: string;
  body: string;
  is_required: boolean;
  choices: Choice[];
};
type Version = {
  id: string;
  version: number;
  status: string;
  body_text: string | null;
  video_url: string | null;
  image_url: string | null;
  video_alt_text: string | null;
  published_at: string | null;
  questions: Question[];
};

const TYPE_LABEL: Record<string, string> = {
  quiz: "クイズ（正解あり）",
  single: "アンケート（1つ選ぶ）",
  multi: "アンケート（いくつでも）",
  free_text: "自由記述",
};

export default function AdminJourneyMissionPage() {
  const { id } = useParams<{ id: string }>();
  const [mission, setMission] = useState<{ title: string; course_id: string } | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState("quiz");
  const [questionBody, setQuestionBody] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    return fetch(`/api/admin/journey/missions/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("読み込みに失敗しました。");
        return res.json();
      })
      .then((data) => {
        setMission(data.mission);
        setVersions(data.versions ?? []);
        setStatus("ready");
      });
  }

  useEffect(() => {
    load().catch(() => setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "操作に失敗しました。");
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作に失敗しました。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const draft = versions.find((version) => version.status === "draft") ?? null;
  const published = versions.find((version) => version.status === "published") ?? null;

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !mission) return <p className="text-red-700 dark:text-red-400">ミッションが見つかりません。</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/admin/journey/courses/${mission.course_id}`} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← コースへ戻る
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">{mission.title}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          公開済みの教材は書き換えられません。修正するときは新しい下書きを作って差し替えてください。
          過去の回答は回答時点のバージョンを参照し続けます。
        </p>
      </div>

      {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{message}</p>}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              {published ? `公開中: v${published.version}` : "公開中の教材はありません"}
            </p>
            {draft && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">下書き: v{draft.version}</p>}
          </div>
          {!draft && (
            <button onClick={() => call("/api/admin/journey/content-versions", "POST", { mission_id: id })} disabled={busy}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              新しい下書きを作る
            </button>
          )}
        </div>
      </div>

      {draft && (
        <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">下書き v{draft.version} の編集</h2>
            <button onClick={() => call(`/api/admin/journey/content-versions/${draft.id}`, "PATCH", { publish: true })} disabled={busy}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              この下書きを公開する
            </button>
          </div>

          {[
            { key: "body_text", label: "本文", textarea: true, note: "" },
            { key: "video_url", label: "動画URL", textarea: false, note: "" },
            { key: "video_alt_text", label: "動画を見られない方向けの説明", textarea: true, note: "動画を設定する場合は必ず埋めてください（指示書§12）" },
            { key: "image_url", label: "画像URL", textarea: false, note: "" },
          ].map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{field.label}</span>
              {field.textarea ? (
                <textarea rows={4} defaultValue={(draft[field.key as keyof Version] as string) ?? ""}
                  onBlur={(e) => call(`/api/admin/journey/content-versions/${draft.id}`, "PATCH", { [field.key]: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
              ) : (
                <input defaultValue={(draft[field.key as keyof Version] as string) ?? ""}
                  onBlur={(e) => call(`/api/admin/journey/content-versions/${draft.id}`, "PATCH", { [field.key]: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
              )}
              {field.note && <span className="mt-1 block text-xs text-amber-800 dark:text-amber-300">{field.note}</span>}
            </label>
          ))}

          <div className="space-y-3 border-t border-amber-200 pt-3 dark:border-amber-900">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">設問</h3>
            {draft.questions.map((question) => (
              <div key={question.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-zinc-900 dark:text-zinc-50">{question.body}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {TYPE_LABEL[question.question_type] ?? question.question_type}
                      {question.is_required ? " / 必須" : " / 任意"}
                    </p>
                  </div>
                  <button onClick={() => call(`/api/admin/journey/questions/${question.id}`, "DELETE")} disabled={busy}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50 dark:border-zinc-700 dark:text-red-400">
                    削除
                  </button>
                </div>

                {question.question_type !== "free_text" && (
                  <div className="mt-2 space-y-1">
                    {question.choices.map((choice) => (
                      <div key={choice.id} className="flex items-center gap-2 text-xs">
                        {question.question_type === "quiz" && (
                          <label className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
                            <input type="checkbox" checked={choice.is_correct}
                              onChange={(e) => call(`/api/admin/journey/choices/${choice.id}`, "PATCH", { is_correct: e.target.checked })} />
                            正解
                          </label>
                        )}
                        <span className="flex-1 text-zinc-800 dark:text-zinc-200">{choice.body}</span>
                        <button onClick={() => call(`/api/admin/journey/choices/${choice.id}`, "DELETE")} disabled={busy}
                          className="text-red-700 hover:underline dark:text-red-400">削除</button>
                      </div>
                    ))}
                    <AddChoice questionId={question.id} onAdd={(body) => call("/api/admin/journey/choices", "POST", { question_id: question.id, body })} />
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">種別</span>
                <select value={questionType} onChange={(e) => setQuestionType(e.target.value)}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">設問文</span>
                <input value={questionBody} onChange={(e) => setQuestionBody(e.target.value)}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
              </label>
              <button
                onClick={async () => {
                  if (await call("/api/admin/journey/questions", "POST", { content_version_id: draft.id, question_type: questionType, body: questionBody })) {
                    setQuestionBody("");
                  }
                }}
                disabled={busy || !questionBody.trim()}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300">
                設問を追加
              </button>
            </div>
          </div>
        </div>
      )}

      {published && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">公開中 v{published.version}（読み取り専用）</h2>
          {published.body_text && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{published.body_text}</p>
          )}
          <div className="mt-3 space-y-2">
            {published.questions.map((question) => (
              <div key={question.id} className="text-xs text-zinc-600 dark:text-zinc-400">
                <p className="text-zinc-800 dark:text-zinc-200">{question.body}</p>
                <p>{TYPE_LABEL[question.question_type] ?? question.question_type}／選択肢{question.choices.length}件</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddChoice({ questionId, onAdd }: { questionId: string; onAdd: (body: string) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-2 pt-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="選択肢を追加"
        className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      <button
        onClick={async () => {
          if (await onAdd(value)) setValue("");
        }}
        disabled={!value.trim()}
        className="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
        data-question-id={questionId}
      >
        追加
      </button>
    </div>
  );
}
