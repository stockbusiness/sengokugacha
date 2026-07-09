import { createSupabaseServerClient } from "@/lib/supabase-server";

export type GachaAnimationRarity = "ANY" | "common" | "mid" | "rare";
export type GachaAnimationStatus = "draft" | "published" | "stopped";

export type GachaAnimationAsset = {
  id: string;
  animation_key: string;
  name: string;
  description: string | null;
  rarity: GachaAnimationRarity;
  only_new_card: boolean;
  video_url: string;
  video_storage_key: string;
  poster_url: string | null;
  poster_storage_key: string | null;
  mime_type: string;
  file_size_bytes: number;
  duration_ms: number;
  width: number | null;
  height: number | null;
  has_audio: boolean;
  allow_skip: boolean;
  skip_after_ms: number;
  minimum_play_ms: number;
  status: GachaAnimationStatus;
  is_default: boolean;
  priority: number;
  weight: number;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SelectedAnimation = {
  id: string;
  key: string;
  videoUrl: string;
  posterUrl: string | null;
  durationMs: number;
  allowSkip: boolean;
  skipAfterMs: number;
  hasAudio: boolean;
};

function isWithinWindow(startsAt: string | null, endsAt: string | null): boolean {
  const now = Date.now();
  if (startsAt && now < new Date(startsAt).getTime()) return false;
  if (endsAt && now > new Date(endsAt).getTime()) return false;
  return true;
}

function weightedPick(candidates: GachaAnimationAsset[]): GachaAnimationAsset {
  const totalWeight = candidates.reduce((sum, c) => sum + Math.max(c.weight, 0), 0);
  if (totalWeight <= 0) return candidates[0];

  let r = Math.random() * totalWeight;
  for (const candidate of candidates) {
    r -= Math.max(candidate.weight, 0);
    if (r <= 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

// 仕様書5.3の優先順位(有効状態→公開期間内→レアリティ一致→priority→weight)で
// 候補を1件選ぶ。ガチャID/イベントID/drawModeは、本アプリには単発ガチャが
// 1種類しか無いため条件から除外している。
function pickBestCandidate(candidates: GachaAnimationAsset[]): GachaAnimationAsset | null {
  if (candidates.length === 0) return null;

  const maxPriority = Math.max(...candidates.map((c) => c.priority));
  const topPriority = candidates.filter((c) => c.priority === maxPriority);
  return weightedPick(topPriority);
}

async function fetchEligibleAssets(rarity: "common" | "mid" | "rare"): Promise<GachaAnimationAsset[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gacha_animation_assets")
    .select("*")
    .eq("status", "published")
    .in("rarity", [rarity, "ANY"])
    .is("deleted_at", null);

  if (error) throw error;
  return ((data ?? []) as GachaAnimationAsset[]).filter((a) => isWithinWindow(a.starts_at, a.ends_at));
}

function toSelected(asset: GachaAnimationAsset): SelectedAnimation {
  return {
    id: asset.id,
    key: asset.animation_key,
    videoUrl: asset.video_url,
    posterUrl: asset.poster_url,
    durationMs: asset.duration_ms,
    allowSkip: asset.allow_skip,
    skipAfterMs: asset.skip_after_ms,
    hasAudio: asset.has_audio,
  };
}

// 仕様書5.4のフォールバック(同レアリティのデフォルト動画→全ガチャ共通デフォルト→省略)。
// 動画が無いことでガチャ自体を失敗させないため、常にnull許容で返す。
export async function selectAnimationForDraw(
  rarity: "common" | "mid" | "rare",
  isNewCard: boolean
): Promise<SelectedAnimation | null> {
  const eligible = await fetchEligibleAssets(rarity);
  if (eligible.length === 0) return null;

  const rarityMatched = eligible.filter((a) => a.rarity === rarity);
  const pool = rarityMatched.length > 0 ? rarityMatched : eligible;

  const newCardCandidates = isNewCard ? pool.filter((a) => a.only_new_card) : [];
  const regularCandidates = pool.filter((a) => !a.only_new_card);

  const best =
    pickBestCandidate(newCardCandidates) ??
    pickBestCandidate(regularCandidates) ??
    pickBestCandidate(pool.filter((a) => a.is_default)) ??
    pickBestCandidate(pool);

  return best ? toSelected(best) : null;
}

export async function getGachaAnimationById(id: string): Promise<GachaAnimationAsset | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gacha_animation_assets")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as GachaAnimationAsset | null;
}
