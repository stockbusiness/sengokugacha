import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForGachaPoster } from "@/lib/image-upload";
import { probeMp4 } from "@/lib/mp4-probe";
import { deleteFromBlob, uploadToBlob } from "@/lib/blob-storage";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_VIDEO_BYTES = Number(process.env.GACHA_VIDEO_MAX_BYTES ?? 10 * 1024 * 1024);
const MAX_VIDEO_DURATION_SECONDS = Number(process.env.GACHA_VIDEO_MAX_DURATION_SECONDS ?? 10);

const EDITABLE_FIELDS = [
  "name",
  "description",
  "rarity",
  "only_new_card",
  "allow_skip",
  "skip_after_ms",
  "minimum_play_ms",
  "status",
  "is_default",
  "priority",
  "weight",
  "starts_at",
  "ends_at",
] as const;
const BOOLEAN_FIELDS = new Set(["only_new_card", "allow_skip", "is_default"]);
const NUMBER_FIELDS = new Set(["skip_after_ms", "minimum_play_ms", "priority", "weight"]);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gacha_animation_assets")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("gacha_animation_assets")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE_FIELDS) {
    if (!formData.has(key)) continue;
    const raw = formData.get(key);
    if (BOOLEAN_FIELDS.has(key)) {
      fields[key] = raw === "true";
    } else if (NUMBER_FIELDS.has(key)) {
      fields[key] = Number(raw);
    } else {
      fields[key] = raw ? String(raw) : null;
    }
  }

  // 動画差し替え。上書きによるCDNキャッシュ問題を避けるため、常に新しいパスへ発行する。
  const videoFile = formData.get("video");
  if (videoFile instanceof File && videoFile.size > 0) {
    if (videoFile.type !== "video/mp4") {
      return NextResponse.json({ error: "動画はMP4形式のみアップロードできます" }, { status: 400 });
    }
    if (videoFile.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `動画ファイルサイズは${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)}MB以下にしてください` },
        { status: 400 }
      );
    }
    const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
    const probe = probeMp4(videoBuffer);
    if (probe) {
      if (probe.durationMs <= 0) {
        return NextResponse.json({ error: "動画の長さを取得できませんでした" }, { status: 400 });
      }
      if (probe.durationMs > MAX_VIDEO_DURATION_SECONDS * 1000) {
        return NextResponse.json(
          { error: `動画は${MAX_VIDEO_DURATION_SECONDS}秒以内にしてください` },
          { status: 400 }
        );
      }
      if (probe.width != null && probe.height != null && probe.width >= probe.height) {
        return NextResponse.json({ error: "縦型(9:16)の動画のみアップロードできます" }, { status: 400 });
      }
    }

    const videoPath = `gacha-animations/videos/${existing.animation_key}-${Date.now()}.mp4`;
    const { publicUrl } = await uploadToBlob(videoPath, videoBuffer, "video/mp4");

    fields.video_url = publicUrl;
    fields.video_storage_key = videoPath;
    fields.mime_type = videoFile.type;
    fields.file_size_bytes = videoFile.size;
    fields.duration_ms = probe?.durationMs ?? 0;
    fields.width = probe?.width ?? null;
    fields.height = probe?.height ?? null;
    fields.has_audio = probe?.hasAudio ?? false;
  }

  const posterFile = formData.get("poster");
  if (posterFile instanceof File && posterFile.size > 0) {
    if (!posterFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "ポスターは画像ファイルのみアップロードできます" }, { status: 400 });
    }
    let resizedPoster;
    try {
      resizedPoster = await resizeForGachaPoster(Buffer.from(await posterFile.arrayBuffer()));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "ポスター画像の処理に失敗しました" },
        { status: 400 }
      );
    }
    const posterPath = `gacha-animations/posters/${existing.animation_key}-${Date.now()}.${resizedPoster.extension}`;
    const { publicUrl } = await uploadToBlob(posterPath, resizedPoster.buffer, resizedPoster.contentType);
    fields.poster_url = publicUrl;
    fields.poster_storage_key = posterPath;
  }

  const actorName = await getAdminActorName();
  fields.updated_by = actorName;

  const { data, error } = await supabase
    .from("gacha_animation_assets")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(actorName, "gacha_animation_update", `id=${id}`);

  return NextResponse.json(data);
}

// 物理削除は「本番未使用」の場合のみ許可する(仕様書6.4)。
// 使用済み(gacha_logsに参照がある)場合は無効化(status=stopped)のみ許可する。
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("gacha_animation_assets")
    .select("id, status, video_storage_key, poster_storage_key")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { count, error: usageError } = await supabase
    .from("gacha_logs")
    .select("id", { count: "exact", head: true })
    .eq("animation_asset_id", id);
  if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 });

  const actorName = await getAdminActorName();

  if ((count ?? 0) > 0 || existing.status === "published") {
    // 使用実績がある、または現在公開中の場合は論理削除に留める。
    const { error } = await supabase
      .from("gacha_animation_assets")
      .update({ status: "stopped", deleted_at: new Date().toISOString(), updated_by: actorName })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAdminAction(actorName, "gacha_animation_soft_delete", `id=${id}`);
    return NextResponse.json({ ok: true, hardDeleted: false });
  }

  const storageKeys = [existing.video_storage_key, existing.poster_storage_key].filter(
    (key): key is string => !!key
  );
  if (storageKeys.length > 0) {
    try {
      await deleteFromBlob(storageKeys);
    } catch (error) {
      // 旧Supabase Storage時代のキーはVercel Blob側に存在せず削除が失敗しうるが、
      // DBレコード自体の削除は続行する(孤立ファイルの掃除に留まるため)。
      console.error("ストレージからの削除に失敗しました", error);
    }
  }

  const { error } = await supabase.from("gacha_animation_assets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(actorName, "gacha_animation_hard_delete", `id=${id}`);
  return NextResponse.json({ ok: true, hardDeleted: true });
}
