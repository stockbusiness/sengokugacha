"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Course = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  display_order: number;
  missionCount: number;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  suspended: "停止中",
};

export default function AdminJourneyCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    return fetch("/api/admin/journey/courses")
      .then((res) => res.json())
      .then((data: Course[]) => {
        setCourses(Array.isArray(data) ? data : []);
        setStatus("ready");
      });
  }

  useEffect(() => {
    load().catch(() => setStatus("error"));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/journey/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました。");
      setCode("");
      setTitle("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作成に失敗しました。");
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error") return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/journey" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← はじまりの旅
        </Link>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-50">コース管理</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          参加者に出るのは「公開中」のコース1本だけです。複数公開されている場合は並び順の先頭が使われます。
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">コード</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="START"
            className="w-32 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">タイトル</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="千ノ国 はじまりの旅"
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50" />
        </label>
        <button type="submit" disabled={creating || !code.trim() || !title.trim()}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {creating ? "作成中..." : "コースを作成"}
        </button>
        {message && <span className="text-xs text-red-700 dark:text-red-400">{message}</span>}
      </form>

      <div className="space-y-2">
        {courses.map((course) => (
          <Link key={course.id} href={`/admin/journey/courses/${course.id}`} className="block">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {course.title} <span className="font-mono text-xs text-zinc-500">{course.code}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">ミッション{course.missionCount}件</p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {STATUS_LABEL[course.status] ?? course.status}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {courses.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">まだコースがありません。</p>}
      </div>
    </div>
  );
}
