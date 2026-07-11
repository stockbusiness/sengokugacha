"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

const STATUS_LABEL: Record<string, string> = {
  published: "内覧可能",
  coming_soon: "近日公開",
};

type PropertySummary = {
  id: string;
  propertyCode: string;
  name: string;
  buildingTypeName: string | null;
  mainImageUrl: string | null;
  featureTags: string[];
  status: "published" | "coming_soon";
};

type AreaDetail = {
  id: string;
  name: string;
  description: string | null;
  mainImageUrl: string | null;
  properties: PropertySummary[];
};

type Status = "loading" | "ready" | "error";

export default function MetaverseTourAreaDetailPage() {
  const params = useParams<{ areaId: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [area, setArea] = useState<AreaDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch(`/api/metaverse/areas/${params.areaId}`)
          .then((res) => {
            if (!res.ok) throw new Error("エリア情報の取得に失敗しました。");
            return res.json();
          })
          .then((data: AreaDetail) => {
            if (cancelled) return;
            setArea(data);
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
  }, [params.areaId]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && area && (
        <div className="space-y-4">
          <PageHeader title={area.name} subtitle={area.description ?? undefined} />

          <div className="grid grid-cols-2 gap-3">
            {area.properties.map((p) => (
              <Link key={p.id} href={`/metaverse-tour/properties/${p.id}`} className="block">
                <Card className="p-0 overflow-hidden transition hover:border-gold/50">
                  {p.mainImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mainImageUrl} alt="" className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center bg-ink-raised text-2xl">🏠</div>
                  )}
                  <div className="p-2">
                    <p className="line-clamp-1 text-xs font-semibold text-parchment">{p.name}</p>
                    <p className="mt-0.5 text-[10px] text-parchment-dim">{p.buildingTypeName ?? "-"}</p>
                    <p className="mt-1 text-[10px] font-semibold text-gold-soft">{STATUS_LABEL[p.status]}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          {area.properties.length === 0 && <p className="text-center text-sm text-parchment-dim">このエリアにはまだ物件がありません。</p>}

          <div className="pt-4 text-center">
            <TextLink href="/metaverse-tour/areas">← エリア一覧に戻る</TextLink>
          </div>
        </div>
      )}
    </div>
  );
}
