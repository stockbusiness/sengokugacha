"use client";

import { useState } from "react";

export function ReferralLinkButton({ plotId }: { plotId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch(`/api/agency/plots/${plotId}/referral-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "URLの発行に失敗しました。");
      setUrl(data.url);
      setQrDataUrl(data.qrDataUrl);
      setState("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "URLの発行に失敗しました。");
      setState("error");
    }
  }

  if (state === "idle" || state === "loading") {
    return (
      <button
        onClick={handleClick}
        disabled={state === "loading"}
        className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-gold-soft hover:bg-gold/10 disabled:opacity-50"
      >
        {state === "loading" ? "発行中..." : "紹介URL・QRを発行"}
      </button>
    );
  }

  if (state === "error") {
    return <p className="text-xs text-crimson">{message}</p>;
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-black/30 p-3">
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="紹介URLのQRコード" className="mx-auto h-32 w-32" />
      )}
      <p className="break-all text-[11px] text-parchment">{url}</p>
    </div>
  );
}
