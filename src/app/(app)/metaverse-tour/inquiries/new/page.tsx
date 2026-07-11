"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

const INQUIRY_TYPES = [
  "詳しい説明を聞きたい",
  "購入を検討している",
  "オンライン内覧を予約したい",
  "価格・支払い方法を確認したい",
  "他の区画と比較したい",
  "その他",
];

const CONTACT_METHODS = ["LINE", "電話", "メール", "Zoom"];

function NewInquiryForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = searchParams.get("propertyId");

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [inquiryType, setInquiryType] = useState(INQUIRY_TYPES[0]);
  const [preferredContact, setPreferredContact] = useState(CONTACT_METHODS[0]);
  const [consentPersonalInfo, setConsentPersonalInfo] = useState(false);
  const [consentAgentShare, setConsentAgentShare] = useState(false);
  const [preferredDatetime, setPreferredDatetime] = useState("");
  const [budget, setBudget] = useState("");
  const [purpose, setPurpose] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    let cancelled = false;
    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consentPersonalInfo || !consentAgentShare) {
      setSubmitError("個人情報の取り扱い・担当代理店への共有について同意が必要です。");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/metaverse/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          inquiryType,
          preferredContact,
          consentPersonalInfo,
          consentAgentShare,
          preferredDatetime: preferredDatetime || null,
          budget: budget || null,
          purpose: purpose || null,
          memo: memo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "送信に失敗しました。");
      router.push(`/metaverse-tour/inquiries/${data.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <LoadingSpinner />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="相談申込" subtitle="担当代理店から改めてご連絡します。" />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-parchment">相談種別</span>
            <select
              value={inquiryType}
              onChange={(e) => setInquiryType(e.target.value)}
              className="w-full rounded-lg border border-gold/20 bg-ink px-3 py-2 text-sm text-parchment"
            >
              {INQUIRY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Card>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-parchment">希望連絡方法</span>
            <select
              value={preferredContact}
              onChange={(e) => setPreferredContact(e.target.value)}
              className="w-full rounded-lg border border-gold/20 bg-ink px-3 py-2 text-sm text-parchment"
            >
              {CONTACT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Card className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-parchment-dim">希望日時(任意)</span>
            <input
              type="text"
              value={preferredDatetime}
              onChange={(e) => setPreferredDatetime(e.target.value)}
              placeholder="例: 平日夜、週末午前など"
              className="w-full rounded-lg border border-gold/20 bg-ink px-3 py-2 text-sm text-parchment"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-parchment-dim">予算(任意)</span>
            <input
              type="text"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full rounded-lg border border-gold/20 bg-ink px-3 py-2 text-sm text-parchment"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-parchment-dim">利用目的(任意)</span>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full rounded-lg border border-gold/20 bg-ink px-3 py-2 text-sm text-parchment"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-parchment-dim">質問内容(任意)</span>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gold/20 bg-ink px-3 py-2 text-sm text-parchment"
            />
          </label>
        </Card>

        <Card className="space-y-2 text-xs text-parchment-dim">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={consentPersonalInfo}
              onChange={(e) => setConsentPersonalInfo(e.target.checked)}
              className="mt-0.5"
            />
            <span>個人情報の取り扱いに同意します</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={consentAgentShare}
              onChange={(e) => setConsentAgentShare(e.target.checked)}
              className="mt-0.5"
            />
            <span>担当代理店への情報共有に同意します</span>
          </label>
          <p>
            掲載内容は今後開発予定のメタバース空間の完成予定イメージです。実際の仕様は開発状況により変更される場合があります。
          </p>
        </Card>

        {submitError && <p className="text-sm text-crimson-dark">{submitError}</p>}

        <Button type="submit" disabled={submitting}>
          {submitting ? "送信中..." : "この内容で相談する"}
        </Button>
      </form>
    </div>
  );
}

export default function NewMetaverseInquiryPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-md px-4 py-10">
          <LoadingSpinner />
        </div>
      }
    >
      <NewInquiryForm />
    </Suspense>
  );
}
