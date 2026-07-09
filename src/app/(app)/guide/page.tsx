"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type Status = "loading" | "ready" | "error";

const GUIDE_SECTIONS = [
  {
    title: "① ガチャで武将を集める",
    body: "「ガチャ」画面から武将を引きます。1つの国につき足軽級・武将級・大名級の3種類の武将がいます。",
  },
  {
    title: "② 国を制圧する",
    body: "同じ国の3種類の武将をすべて集めると、その国が制圧されます。制圧状況は「日本地図」画面から確認できます。",
  },
  {
    title: "③ 地方をコンプする",
    body: "ひとつの地方に属する国をすべて制圧すると「地方コンプ」となり、石高ボーナスと称号がもらえます。",
  },
  {
    title: "④ 天下統一を目指す",
    body: "一定数の国を制圧すると最終国「美濃国」への挑戦権が解放されます。美濃国を制圧すると天下統一達成です。",
  },
  {
    title: "⑤ 図鑑でコレクションを確認",
    body: "「図鑑」画面では、これまでに獲得した武将と未獲得の武将(???表示)を地方・国別に確認できます。",
  },
];

export default function GuidePage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      <PageHeader title="遊び方" subtitle="戦国パスポートの基本の流れをご紹介します。" />

      <div className="space-y-3">
        {GUIDE_SECTIONS.map((section) => (
          <Card key={section.title}>
            <h2 className="font-heading text-sm font-bold text-gold-soft">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-parchment">{section.body}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-2 border-t border-gold/15 pt-6">
        <TextLink href="/faq">よくある質問(FAQ)</TextLink>
        <TextLink href="/announcements">お知らせ</TextLink>
        <TextLink href="/legal/support">お問い合わせ</TextLink>
        <TextLink href="/rates">排出率を見る</TextLink>
      </div>
    </div>
  );
}
