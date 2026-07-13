import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForGachaPoster } from "@/lib/image-upload";
import { probeMp4 } from "@/lib/mp4-probe";
import { uploadToBlob } from "@/lib/blob-storage";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_VIDEO_BYTES = Number(process.env.GACHA_VIDEO_MAX_BYTES ?? 10 * 1024 * 1024);
const MAX_VIDEO_DURATION_SECONDS = Number(process.env.GACHA_VIDEO_MAX_DURATION_SECONDS ?? 10);

const RARITIES = ["ANY", "common", "mid", "rare"] as const;
const STATUSES = ["draft", "published", "stopped"] as const;

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const rarity = searchParams.get("rarity");
  const keyword = searchParams.get("keyword");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));

  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("gacha_animation_assets")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (rarity) query = query.eq("rarity", rarity);
  if (keyword) query = query.or(`name.ilike.%${keyword}%,animation_key.ilike.%${keyword}%`);

  const from = (page - 1) * limit;
  const { data, error, count } = await query.range(from, from + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const animationKey = String(formData.get("animation_key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = formData.get("description");
  const rarity = String(formData.get("rarity") ?? "ANY");
  const status = String(formData.get("status") ?? "draft");
  const onlyNewCard = formData.get("only_new_card") === "true";
  const allowSkip = formData.get("allow_skip") !== "false";
  const skipAfterMs = Number(formData.get("skip_after_ms") ?? 1000);
  const minimumPlayMs = Number(formData.get("minimum_play_ms") ?? 0);
  const isDefault = formData.get("is_default") === "true";
  const priority = Number(formData.get("priority") ?? 0);
  const weight = Number(formData.get("weight") ?? 100);
  const startsAt = formData.get("starts_at") || null;
  const endsAt = formData.get("ends_at") || null;

  if (!animationKey || !name) {
    return NextResponse.json({ error: "animation_key, name は必須です" }, { status: 400 });
  }
  if (!(RARITIES as readonly string[]).includes(rarity)) {
    return NextResponse.json({ error: "rarity が不正です" }, { status: 400 });
  }
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "status が不正です" }, { status: 400 });
  }

  const videoFile = formData.get("video");
  if (!(videoFile instanceof File)) {
    return NextResponse.json({ error: "動画ファイルを指定してください" }, { status: 400 });
  }
  if (videoFile.type !== "video/mp4") {
    return NextResponse.json({ error: "動画はMP4形式のみアップロードできます" }, { status: 400 });
  }
  if (videoFile.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `動画ファイルサイズは${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)}MB以下にしてください` },
      { status: 400 }
    );
  }
  if (videoFile.size === 0) {
    return NextResponse.json({ error: "空の動画ファイルです" }, { status: 400 });
  }

  const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
  const probe = probeMp4(videoBuffer);

  if (probe) {
    if (probe.durationMs <= 0) {
      return NextResponse.json({ error: "動画の長さを取得できませんでした(0秒動画の可能性があります)" }, { status: 400 });
    }
    if (probe.durationMs > MAX_VIDEO_DURATION_SECONDS * 1000) {
      return NextResponse.json(
        { error: `動画は${MAX_VIDEO_DURATION_SECONDS}秒以内にしてください(検出された長さ: ${(probe.durationMs / 1000).toFixed(1)}秒)` },
        { status: 400 }
      );
    }
    if (probe.width != null && probe.height != null && probe.width >= probe.height) {
      return NextResponse.json({ error: "縦型(9:16)の動画のみアップロードできます" }, { status: 400 });
    }
  }

  const supabase = createSupabaseServerClient();
  const timestamp = Date.now();
  const videoPath = `gacha-animations/videos/${animationKey}-${timestamp}.mp4`;

  const { publicUrl: videoUrl } = await uploadToBlob(videoPath, videoBuffer, "video/mp4");

  let posterUrl: string | null = null;
  let posterStorageKey: string | null = null;
  const posterFile = formData.get("poster");
  if (posterFile instanceof File && posterFile.size > 0) {
    if (!posterFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "ポスターは画像ファイルのみアップロードできます" }, { status: 400 });
    }
    const posterInput = Buffer.from(await posterFile.arrayBuffer());
    let resizedPoster;
    try {
      resizedPoster = await resizeForGachaPoster(posterInput);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "ポスター画像の処理に失敗しました" },
        { status: 400 }
      );
    }
    const posterPath = `gacha-animations/posters/${animationKey}-${timestamp}.${resizedPoster.extension}`;
    const { publicUrl } = await uploadToBlob(posterPath, resizedPoster.buffer, resizedPoster.contentType);
    posterUrl = publicUrl;
    posterStorageKey = posterPath;
  }

  const actorName = await getAdminActorName();

  const { data, error } = await supabase
    .from("gacha_animation_assets")
    .insert({
      animation_key: animationKey,
      name,
      description: description ? String(description) : null,
      rarity,
      only_new_card: onlyNewCard,
      video_url: videoUrl,
      video_storage_key: videoPath,
      poster_url: posterUrl,
      poster_storage_key: posterStorageKey,
      mime_type: videoFile.type,
      file_size_bytes: videoFile.size,
      duration_ms: probe?.durationMs ?? 0,
      width: probe?.width ?? null,
      height: probe?.height ?? null,
      has_audio: probe?.hasAudio ?? false,
      allow_skip: allowSkip,
      skip_after_ms: skipAfterMs,
      minimum_play_ms: minimumPlayMs,
      status,
      is_default: isDefault,
      priority,
      weight,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: actorName,
      updated_by: actorName,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(actorName, "gacha_animation_create", `animation_key=${animationKey}`);

  return NextResponse.json(data);
}
