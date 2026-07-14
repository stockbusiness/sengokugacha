import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { uploadToBlob } from "@/lib/blob-storage";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const KIND_TO_COLUMN = { order: "evidence_file_path", payment: "payment_evidence_file_path" } as const;

// 証憑ファイルのアップロード(5-1)。指示書は「管理者のみ閲覧可能」「公開URLを直接推測
// できない保存方法」を要求している。Vercel Blobは公開URLしか提供しないため、
// 実体はランダムなパスで保存しつつ、ブラウザには生のBlob URLを一切渡さず、常に
// GET(このファイルの下)の管理者認証付きプロキシ経由でのみ閲覧させることで満たす。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const kind = formData?.get("kind");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ファイルを指定してください" }, { status: 400 });
  }
  if (kind !== "order" && kind !== "payment") {
    return NextResponse.json({ error: "kindはorderまたはpaymentを指定してください" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "画像(jpg/png/webp)またはPDFのみアップロードできます" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "ファイルサイズは10MB以下にしてください" }, { status: 400 });
  }

  const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const path = `external-order-evidence/${randomUUID()}.${extension}`;

  let blobUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    ({ publicUrl: blobUrl } = await uploadToBlob(path, buffer, file.type));
  } catch (error) {
    const message = error instanceof Error ? error.message : "アップロードに失敗しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const column = KIND_TO_COLUMN[kind];
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("external_orders").update({ [column]: blobUrl }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "external_order_evidence_upload", `order_id=${id} kind=${kind}`, {
    targetType: "external_order",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}

// 証憑ファイルの閲覧(管理者認証必須のプロキシ)。ブラウザには生のBlob URLを渡さない。
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "order" && kind !== "payment") {
    return NextResponse.json({ error: "kindはorderまたはpaymentを指定してください" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: order, error } = await supabase
    .from("external_orders")
    .select("evidence_file_path, payment_evidence_file_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const blobUrl = kind === "order" ? order?.evidence_file_path : order?.payment_evidence_file_path;
  if (!blobUrl) return NextResponse.json({ error: "not found" }, { status: 404 });

  const blobRes = await fetch(blobUrl);
  if (!blobRes.ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buffer = Buffer.from(await blobRes.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": blobRes.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}
