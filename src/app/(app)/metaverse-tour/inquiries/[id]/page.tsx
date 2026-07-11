"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type Inquiry = {
  id: string;
  inquiryType: string;
  status: "new" | "contacted" | "in_progress" | "closed";
  propertyName: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<Inquiry["status"], string> = {
  new: "受付済み(担当代理店からのご連絡をお待ちください)",
  contacted: "連絡済み",
  in_progress: "対応中",
  closed: "対応完了",
};

type Status = "loading" | "ready" | "error";

export default function MetaverseInquiryStatusPage() {
  const params = useParams<{ id: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/metaverse/inquiries/me")
          .then((res) => res.json())
          .then((data: Inquiry[]) => {
            if (cancelled) return;
            const found = data.find((i) => i.id === params.id) ?? null;
            setInquiry(found);
            setStatus("ready");
          });
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="相談申込を受け付けました" />

      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && inquiry && (
        <div className="space-y-4">
          <Card className="text-center">
            <p className="text-sm text-parchment">{inquiry.inquiryType}</p>
            {inquiry.propertyName && <p className="mt-1 text-xs text-parchment-dim">{inquiry.propertyName}</p>}
            <p className="mt-3 text-sm font-semibold text-gold-soft">{STATUS_LABEL[inquiry.status]}</p>
          </Card>
          <p className="text-center text-xs text-parchment-dim">
            {new Date(inquiry.createdAt).toLocaleString("ja-JP")}に受け付けました。
          </p>
        </div>
      )}

      {status === "ready" && !inquiry && (
        <Card className="text-center text-sm text-parchment-dim">相談情報が見つかりませんでした。</Card>
      )}

      <div className="mt-8 text-center">
        <TextLink href="/metaverse-tour">← 内覧トップに戻る</TextLink>
      </div>
    </div>
  );
}
