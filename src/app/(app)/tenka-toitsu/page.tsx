"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type OwnedWarlordOption = {
  id: string;
  name: string;
  rarity: string;
  imageUrl: string | null;
};

type TenkaToitsuStatus = {
  minoConquered: boolean;
  achieved: boolean;
  selectedWarlordName: string | null;
  ownedWarlords: OwnedWarlordOption[];
};

type Status = "loading" | "ready" | "submitting" | "error";

export default function TenkaToitsuPage() {
  const [data, setData] = useState<TenkaToitsuStatus | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function loadData() {
    return fetch("/api/tenka-toitsu")
      .then((res) => res.json())
      .then((body: TenkaToitsuStatus) => {
        setData(body);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return loadData();
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : null);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    if (!selectedId) return;
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/tenka-toitsu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warlordId: selectedId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "登録に失敗しました。");
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
      setStatus("ready");
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="天下統一" />

      {status === "loading" && <p className="text-center text-parchment-dim">読み込み中...</p>}

      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
          {errorMessage ?? "読み込みに失敗しました。"}
        </Card>
      )}

      {status !== "loading" && data && !data.minoConquered && (
        <Card className="text-center text-sm text-parchment-dim">
          まだ美濃国は制圧されていません。全国を巡り、美濃国の3武将を集めましょう。
        </Card>
      )}

      {status !== "loading" && data && data.minoConquered && data.achieved && (
        <div className="space-y-4">
          <Card highlight className="text-center">
            <p className="font-semibold text-gold-soft">称号「天下人」を獲得しました!</p>
            {data.selectedWarlordName && (
              <p className="mt-2 text-sm text-parchment">
                代表武将: <span className="font-semibold">{data.selectedWarlordName}</span>
              </p>
            )}
            <p className="mt-3 text-xs text-parchment-dim">
              記念NFT画像・特典クーポンは準備が整い次第、追ってお届けします。
            </p>
          </Card>
        </div>
      )}

      {status !== "loading" &&
        data &&
        data.minoConquered &&
        !data.achieved &&
        (data.ownedWarlords.length === 0 ? (
          <Card className="text-center text-sm text-parchment-dim">
            代表武将を選ぶには、まず武将を1体以上所持している必要があります。
          </Card>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-parchment-dim">
              天下統一を記念する代表武将を1体選んでください。
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.ownedWarlords.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedId(w.id)}
                  className={
                    "rounded-lg border p-3 text-left text-sm transition " +
                    (selectedId === w.id
                      ? "border-gold/60 bg-gold/10"
                      : "border-gold/15 bg-ink-raised/80 hover:border-gold/40")
                  }
                >
                  <p className="font-semibold text-parchment">{w.name}</p>
                  <p className="text-xs text-gold-soft">{w.rarity}</p>
                </button>
              ))}
            </div>

            {errorMessage && (
              <p className="text-center text-sm text-crimson-dark">{errorMessage}</p>
            )}

            <Button onClick={handleSubmit} disabled={!selectedId || status === "submitting"}>
              {status === "submitting" ? "登録中..." : "この武将で天下統一を宣言する"}
            </Button>
          </div>
        ))}
    </div>
  );
}
