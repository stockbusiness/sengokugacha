"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { DevelopmentPlotCard } from "@/components/founding-member/DevelopmentPlotCard";
import { FoundingMemberPanel } from "@/components/founding-member/FoundingMemberPanel";
import { NationBuilderOfferCard } from "@/components/founding-member/NationBuilderOfferCard";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";
import type { PassportData } from "@/lib/passport";

type Status = "loading" | "ready" | "error";
type ExternalLink = { key: string; label: string; url: string };

const SECTIONS = [
  {
    title: "創設メンバーとは",
    body: "戦国経済圏OSの立ち上げ以前から、既存のメタバース土地をご購入いただいた皆さまです。プロジェクトの初期建設を支えた方として、永久称号・バッジ・各種優先権を差し上げます。",
  },
  {
    title: "既存の土地はどう扱われるか",
    body: "既存の土地権利は失われません。新しい戦国経済圏では、既存土地を「国家開発区画」として扱い、LIFFアプリ・国家建設・将来のメタバースに段階的に接続していきます。",
  },
  {
    title: "国家開発区画とは",
    body: "既存の土地を戦国経済圏OSの世界観で再定義したものです。区画ID・所属エリアはそのまま引き継がれ、国家建設の進行に応じて順次開発ステータスが更新されます。",
  },
  {
    title: "メタバース実装時の優先権",
    body: "将来メタバース機能を実装する際、創設メンバーの国家開発区画は優先的に反映されます。",
  },
  {
    title: "戦国パスポート内での特典",
    body: "国民証・国家ダッシュボードに創設メンバーバッジが表示されるほか、建国メンバー商品への特別価格をご案内します。",
  },
];

const FAQS = [
  {
    q: "既存の土地の権利は変わりますか?",
    a: "変わりません。国家開発区画として引き続き権利をお持ちいただけます。",
  },
  {
    q: "何か新たにお支払いが必要ですか?",
    a: "創設メンバーとしての地位を維持するための追加のお支払いは不要です。",
  },
  {
    q: "建国メンバーとの違いは何ですか?",
    a: "創設メンバーは既存土地オーナーの皆さまを指し、建国メンバーは新規に中核プログラムへ参加される方を指します。創設メンバーには建国メンバー商品の特別価格をご案内します。",
  },
];

export default function FoundingMemberPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const session = await ensureLiffSession();
        if (session.status === "redirecting") return;

        const meRes = await fetch("/api/me");
        if (meRes.ok) {
          const data: PassportData = await meRes.json();
          if (!cancelled) setPassport(data);
        }

        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
        setStatus("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;

    fetch("/api/links")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ExternalLink[]) => {
        if (!cancelled) setExternalLinks(data);
      })
      .catch(() => {
        /* 送客導線はおまけ機能のため、取得失敗しても本文表示は継続する */
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <p className="text-center text-parchment-dim">読み込み中...</p>
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

  const nationBuilderLink = externalLinks.find((link) => link.key === "nation_builder_program") ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader title="創設メンバー制度" subtitle="既存の土地オーナーの皆さまへ" />

      {passport?.isFoundingMember && (
        <div className="mb-6 space-y-4">
          <FoundingMemberPanel passport={passport} />
          <DevelopmentPlotCard passport={passport} />
        </div>
      )}

      <Card highlight className="mb-6 text-center text-sm leading-relaxed text-parchment">
        既存の土地権利は失われません。
        <br />
        新しい戦国経済圏では、既存土地を「国家開発区画」として扱い、
        LIFFアプリ・国家建設・将来のメタバースに段階的に接続していきます。
      </Card>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <h2 className="font-heading text-sm font-bold text-gold-soft">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-parchment">{section.body}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <NationBuilderOfferCard
          isFoundingMember={passport?.isFoundingMember ?? false}
          detailUrl={nationBuilderLink?.url ?? null}
        />
      </div>

      <div className="mt-6 space-y-3">
        <h2 className="text-center text-xs tracking-[0.2em] text-gold/70">FAQ</h2>
        {FAQS.map((faq) => (
          <Card key={faq.q}>
            <p className="text-sm font-bold text-gold-soft">Q. {faq.q}</p>
            <p className="mt-2 text-sm leading-relaxed text-parchment">A. {faq.a}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 text-center">
        <TextLink href="/">ホームに戻る</TextLink>
      </div>
    </div>
  );
}
