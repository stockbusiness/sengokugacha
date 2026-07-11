"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, LinkButton, TextLink } from "@/components/ui/Button";
import { ensureLiffSession } from "@/lib/client/ensure-liff-session";

type PropertyDetail = {
  id: string;
  propertyCode: string;
  name: string;
  areaName: string;
  buildingTypeName: string | null;
  mainImageUrl: string | null;
  imageUrls: string[];
  featureTags: string[];
  intendedUse: string | null;
  shortDescription: string | null;
  description: string | null;
  status: "published" | "coming_soon";
  agentName: string | null;
  isFavorite: boolean;
};

type Status = "loading" | "ready" | "error";

export default function MetaverseTourPropertyDetailPage() {
  const params = useParams<{ propertyId: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [showTourModal, setShowTourModal] = useState(false);
  const [launchingTour, setLaunchingTour] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    ensureLiffSession()
      .then((session) => {
        if (cancelled || session.status === "redirecting") return;
        return fetch(`/api/metaverse/properties/${params.propertyId}`)
          .then((res) => {
            if (!res.ok) throw new Error("物件情報の取得に失敗しました。");
            return res.json();
          })
          .then((data: PropertyDetail) => {
            if (cancelled) return;
            setProperty(data);
            setStatus("ready");
            fetch("/api/metaverse/events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ eventType: "property_detail_view", propertyId: data.id }),
            }).catch(() => {
              /* 閲覧ログの記録失敗は表示に影響させない */
            });
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
  }, [params.propertyId]);

  async function handleToggleFavorite() {
    if (!property) return;
    setFavoritePending(true);
    try {
      if (property.isFavorite) {
        await fetch(`/api/metaverse/favorites/${property.id}`, { method: "DELETE" });
      } else {
        await fetch("/api/metaverse/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId: property.id }),
        });
      }
      setProperty((prev) => (prev ? { ...prev, isFavorite: !prev.isFavorite } : prev));
    } finally {
      setFavoritePending(false);
    }
  }

  async function handleStartTour() {
    if (!property) return;
    setLaunchingTour(true);
    try {
      const res = await fetch(`/api/metaverse/properties/${property.id}/tour-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: `/metaverse-tour/properties/${property.id}` }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "内覧セッションの発行に失敗しました。");
      window.open(body.data.tourUrl, "_blank", "noopener,noreferrer");
      setShowTourModal(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "予期しないエラーが発生しました。");
    } finally {
      setLaunchingTour(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 pb-28">
      {status === "loading" && <LoadingSpinner />}
      {status === "error" && (
        <Card className="border-crimson/50 bg-crimson-soft/40 text-center text-sm text-parchment">{errorMessage}</Card>
      )}

      {status === "ready" && property && (
        <div className="space-y-4">
          <PageHeader title={property.name} subtitle={`${property.areaName} / ${property.propertyCode}`} />

          {property.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={property.mainImageUrl} alt="" className="w-full rounded-xl object-cover" />
          ) : (
            <div className="flex h-40 w-full items-center justify-center rounded-xl bg-ink-raised text-3xl">🏠</div>
          )}

          <Card>
            {property.buildingTypeName && (
              <p className="text-xs text-parchment-dim">建物タイプ: {property.buildingTypeName}</p>
            )}
            {property.shortDescription && <p className="mt-2 text-sm text-parchment">{property.shortDescription}</p>}
            {property.description && <p className="mt-2 text-sm text-parchment-dim">{property.description}</p>}
            {property.intendedUse && (
              <p className="mt-2 text-xs text-parchment-dim">想定用途: {property.intendedUse}</p>
            )}
            {property.featureTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {property.featureTags.map((tag) => (
                  <span key={tag} className="rounded-full border border-gold/25 px-2 py-0.5 text-[11px] text-gold-soft">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {property.agentName && (
              <p className="mt-3 text-xs text-parchment-dim">担当代理店: {property.agentName}</p>
            )}
          </Card>

          <Card className="text-xs leading-relaxed text-parchment-dim">
            掲載画像および動画は、今後開発予定のメタバース空間を表現した完成予定イメージです。実際の仕様、デザイン、機能、配置は、開発状況により変更される場合があります。
          </Card>

          <LinkButton href={`/metaverse-tour/inquiries/new?propertyId=${property.id}`} variant="secondary">
            担当者に相談する
          </LinkButton>

          <div className="text-center">
            <TextLink href={`/metaverse-tour/areas`}>← エリア一覧に戻る</TextLink>
          </div>
        </div>
      )}

      {status === "ready" && property && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-ink/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-md gap-2">
            <Button variant="secondary" onClick={handleToggleFavorite} disabled={favoritePending} className="!w-auto flex-1">
              {property.isFavorite ? "★ お気に入り済み" : "☆ お気に入りに追加"}
            </Button>
            <Button onClick={() => setShowTourModal(true)} className="!w-auto flex-[2]">
              全画面で内覧する
            </Button>
          </div>
        </div>
      )}

      {showTourModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 px-6" onClick={() => setShowTourModal(false)}>
          <Card className="max-w-sm text-center" >
            <p className="text-sm text-parchment" onClick={(e) => e.stopPropagation()}>
              大きな画面で内覧するため、外部ブラウザを開きます。内覧後はLINEへ戻ることができます。
            </p>
            <div className="mt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
              <Button onClick={handleStartTour} disabled={launchingTour}>
                {launchingTour ? "準備中..." : "内覧を開く"}
              </Button>
              <Button variant="secondary" onClick={() => setShowTourModal(false)}>
                キャンセル
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
