"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import type { PassportData } from "@/lib/passport";

type Status = "initializing" | "ready" | "deleting" | "done" | "error";

export default function AccountDeletePage() {
  const [status, setStatus] = useState<Status>("initializing");
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch("/api/me")
          .then((res) => res.json())
          .then((data: PassportData) => {
            if (cancelled) return;
            setPassport(data);
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
  }, []);

  async function handleDelete() {
    setStatus("deleting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "退会処理に失敗しました。");
      setStatus("done");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
      setStatus("ready");
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="退会" />

      {status === "initializing" && <p className="text-center text-parchment-dim">読み込み中...</p>}

      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
          {errorMessage}
        </Card>
      )}

      {status === "done" && (
        <Card highlight className="text-center">
          <p className="font-semibold text-gold-soft">退会処理が完了しました。</p>
          <p className="mt-2 text-sm text-parchment-dim">
            ご利用ありがとうございました。このトーク画面は閉じていただいて構いません。
          </p>
        </Card>
      )}

      {(status === "ready" || status === "deleting") && passport && (
        <div className="space-y-4">
          <Card>
            <p className="text-xs text-parchment-dim">城主名</p>
            <p className="font-heading text-lg font-bold text-parchment">
              {passport.displayName ?? "(未設定)"}
            </p>
          </Card>

          <Card className="border-crimson/40 bg-crimson-soft/30 space-y-2 text-sm text-parchment">
            <p className="font-semibold text-parchment">退会すると、以下のデータが削除されます。</p>
            <ul className="list-disc space-y-1 pl-5 text-parchment-dim">
              <li>所持武将・国盗り(制圧)状況</li>
              <li>ガチャ抽選履歴・ログイン履歴・実績記録</li>
              <li>石高・戦功・ガチャ券などの所持数</li>
            </ul>
            <p className="pt-1 font-semibold text-parchment">
              なお、購入履歴および代理店紹介に関する売上記録は、法令に基づく会計記録として
              個人を特定できない形で保持されます。
            </p>
            <p className="pt-1 text-xs text-parchment-dim">この操作は取り消せません。</p>
          </Card>

          {errorMessage && (
            <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">
              {errorMessage}
            </Card>
          )}

          <label className="flex items-start gap-2 text-sm text-parchment-dim">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1"
            />
            上記内容を理解した上で退会します。
          </label>

          <button
            onClick={handleDelete}
            disabled={!agreed || status === "deleting"}
            className="w-full rounded-lg border border-crimson/60 bg-crimson-soft/40 px-4 py-3 text-center font-semibold text-parchment transition hover:bg-crimson-soft/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "deleting" ? "処理中..." : "退会する"}
          </button>
        </div>
      )}
    </div>
  );
}
