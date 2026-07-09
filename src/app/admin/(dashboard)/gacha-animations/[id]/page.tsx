"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AnimationForm, type AnimationFormValues } from "../AnimationForm";

type AnimationDetail = AnimationFormValues & {
  id: string;
  video_url: string;
  poster_url: string | null;
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditGachaAnimationPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<AnimationDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch(`/api/admin/gacha-animations/${params.id}`)
      .then((res) => res.json())
      .then((raw) => {
        setData({
          id: raw.id,
          animation_key: raw.animation_key,
          name: raw.name,
          description: raw.description ?? "",
          rarity: raw.rarity,
          status: raw.status,
          only_new_card: raw.only_new_card,
          allow_skip: raw.allow_skip,
          skip_after_ms: raw.skip_after_ms,
          minimum_play_ms: raw.minimum_play_ms,
          is_default: raw.is_default,
          priority: raw.priority,
          weight: raw.weight,
          starts_at: toDatetimeLocal(raw.starts_at),
          ends_at: toDatetimeLocal(raw.ends_at),
          video_url: raw.video_url,
          poster_url: raw.poster_url,
        });
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [params.id]);

  if (status === "loading") return <p className="text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  if (status === "error" || !data) return <p className="text-red-700 dark:text-red-400">読み込みに失敗しました。</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">動画演出を編集: {data.name}</h1>
      <AnimationForm
        mode="edit"
        animationId={data.id}
        initialValues={data}
        currentVideoUrl={data.video_url}
        currentPosterUrl={data.poster_url}
      />
    </div>
  );
}
