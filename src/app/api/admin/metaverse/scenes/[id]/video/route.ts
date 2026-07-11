import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { probeMp4 } from "@/lib/mp4-probe";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_VIDEO_BYTES = Number(process.env.METAVERSE_VIDEO_MAX_BYTES ?? 50 * 1024 * 1024);
const MAX_VIDEO_DURATION_SECONDS = Number(process.env.METAVERSE_VIDEO_MAX_DURATION_SECONDS ?? 60);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const formData = await request.formData().catch(() => null);
  const videoFile = formData?.get("file");
  if (!(videoFile instanceof File)) {
    return NextResponse.json({ error: "動画ファイルを指定してください" }, { status: 400 });
  }
  if (videoFile.type !== "video/mp4") {
    return NextResponse.json({ error: "動画はMP4形式のみアップロードできます" }, { status: 400 });
  }
  if (videoFile.size === 0) {
    return NextResponse.json({ error: "空の動画ファイルです" }, { status: 400 });
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
      return NextResponse.json({ error: "動画の長さを取得できませんでした(0秒動画の可能性があります)" }, { status: 400 });
    }
    if (probe.durationMs > MAX_VIDEO_DURATION_SECONDS * 1000) {
      return NextResponse.json(
        { error: `動画は${MAX_VIDEO_DURATION_SECONDS}秒以内にしてください(検出された長さ: ${(probe.durationMs / 1000).toFixed(1)}秒)` },
        { status: 400 }
      );
    }
  }

  const supabase = createSupabaseServerClient();
  const path = `scenes/${id}-${Date.now()}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from("metaverse-videos")
    .upload(path, videoBuffer, { contentType: "video/mp4", upsert: true, cacheControl: "60" });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("metaverse-videos").getPublicUrl(path);

  const { data, error } = await supabase
    .from("metaverse_tour_scenes")
    .update({
      video_url: publicUrl,
      video_duration_ms: probe?.durationMs ?? null,
      video_mime_type: videoFile.type,
      video_file_size_bytes: videoFile.size,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_scene_video_upload", `scene_id=${id}`);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("metaverse_tour_scenes")
    .update({
      video_url: null,
      video_duration_ms: null,
      video_mime_type: null,
      video_file_size_bytes: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_scene_video_delete", `scene_id=${id}`);
  return NextResponse.json(data);
}
