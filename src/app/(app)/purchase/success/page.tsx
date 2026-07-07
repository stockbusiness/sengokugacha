"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";

export default function PurchaseSuccessPage() {
  const [liffUrl, setLiffUrl] = useState("/");

  useEffect(() => {
    fetch("/api/app-config")
      .then((res) => res.json())
      .then((config) => {
        if (config.liffId) setLiffUrl(`https://liff.line.me/${config.liffId}`);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16">
      <Card highlight className="w-full text-center">
        <h1 className="font-heading mb-4 text-2xl font-bold text-gold-soft">
          ご購入ありがとうございました
        </h1>
        <p className="mb-6 text-sm text-parchment-dim">
          ご購入内容は数秒〜数分以内に戦国パスポートへ反映されます。反映されない場合は、しばらくしてから再度ご確認ください。
        </p>
        <LinkButton href={liffUrl}>LINEに戻る</LinkButton>
      </Card>
    </div>
  );
}
