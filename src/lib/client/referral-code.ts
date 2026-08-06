"use client";

// 代理店の紹介リンク(?ref=代理店コード)を読む共通処理。
//
// 代理店は /agency/plots で区画ごとに紹介URL・QRを発行する。そのURLは
// https://liff.line.me/{liffId}/castles/{castleId}/plots/{plotId}?ref=CODE
// の形で、LINEログインのリダイレクトを挟むとクエリが消えるため、
// ensure-liff-session.ts が sessionStorage へ退避している。
//
// URLに残っていればそれを、無ければ退避したものを使う(ensure-liff-session.ts が
// ログイン時に使う優先順位と同じ)。
export const REFERRAL_CODE_STORAGE_KEY = "sengoku_ref_code";

export function readReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("ref");
  if (fromUrl) return fromUrl;
  return sessionStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
}
