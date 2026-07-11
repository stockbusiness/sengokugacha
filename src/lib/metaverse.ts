import { randomBytes, createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 城下町デジタル内覧のデータアクセス層。
//
// 重要: ここで定義するプレイヤー向けの型・取得関数は、価格(internal_price_yen)・
// 権利内容(internal_rights_note)・特典(internal_benefits_note)を一切含めない。
// これらは管理画面向けAPI(/api/admin/metaverse/*、フェーズ2で実装)からのみ
// 参照・編集できる、社内の営業活動・将来の準備のための項目という位置づけ。

export type MetaverseAreaSummary = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  isRecommended: boolean;
  isNew: boolean;
  publishedPropertyCount: number;
};

export type MetaverseAreaDetail = MetaverseAreaSummary & {
  description: string | null;
  mainImageUrl: string | null;
  properties: MetaversePropertySummary[];
};

export type MetaversePropertySummary = {
  id: string;
  propertyCode: string;
  name: string;
  areaId: string;
  areaName: string;
  buildingTypeName: string | null;
  mainImageUrl: string | null;
  featureTags: string[];
  status: "coming_soon" | "published";
  isRecommended: boolean;
  isNew: boolean;
};

export type MetaversePropertyDetail = MetaversePropertySummary & {
  shortDescription: string | null;
  description: string | null;
  intendedUse: string | null;
  imageUrls: string[];
  agentName: string | null;
  isFavorite: boolean;
};

export type MetaverseSceneHotspot = {
  id: string;
  title: string;
  description: string | null;
  positionX: number;
  positionY: number;
  icon: string | null;
  status: "available_now" | "planned" | "future_concept";
};

export type MetaverseScene = {
  id: string;
  name: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  description: string | null;
  allowZoom: boolean;
  hotspots: MetaverseSceneHotspot[];
  videoUrl: string | null;
  videoDurationMs: number | null;
};

const PLAYER_PROPERTY_STATUSES = ["published", "coming_soon"] as const;

function mapPropertyRow(
  row: {
    id: string;
    property_code: string;
    name: string;
    area_id: string;
    main_image_url: string | null;
    feature_tags: string[] | null;
    status: string;
    is_recommended: boolean;
    is_new: boolean;
    metaverse_areas?: { name: string } | null;
    metaverse_building_types?: { name: string } | null;
  },
  defaultImageUrl: string | null = null
): MetaversePropertySummary {
  return {
    id: row.id,
    propertyCode: row.property_code,
    name: row.name,
    areaId: row.area_id,
    areaName: row.metaverse_areas?.name ?? "",
    buildingTypeName: row.metaverse_building_types?.name ?? null,
    mainImageUrl: row.main_image_url ?? defaultImageUrl,
    featureTags: row.feature_tags ?? [],
    status: row.status === "published" ? "published" : "coming_soon",
    isRecommended: row.is_recommended,
    isNew: row.is_new,
  };
}

// エリア・物件の画像が未設定(null)の場合に使う、共通のデフォルト画像。
// 個別に画像をアップロードすればそちらが優先され、アップロードしていない
// (=nullのまま)場合だけこのデフォルトにフォールバックする。
export async function getDefaultImages(): Promise<{ property: string | null; area: string | null }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_tour_settings")
    .select("default_property_image_url, default_area_image_url")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return {
    property: data?.default_property_image_url ?? null,
    area: data?.default_area_image_url ?? null,
  };
}

export async function getMetaverseOverview(): Promise<{
  publishedPropertyCount: number;
  areaCount: number;
  recommendedProperties: MetaversePropertySummary[];
}> {
  const supabase = createSupabaseServerClient();

  const [{ count: propertyCount }, { count: areaCount }, { data: recommendedRows, error: recommendedError }, defaults] =
    await Promise.all([
      supabase
        .from("metaverse_properties")
        .select("id", { count: "exact", head: true })
        .in("status", PLAYER_PROPERTY_STATUSES),
      supabase.from("metaverse_areas").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase
        .from("metaverse_properties")
        .select("id, property_code, name, area_id, main_image_url, feature_tags, status, is_recommended, is_new, metaverse_areas(name), metaverse_building_types(name)")
        .in("status", PLAYER_PROPERTY_STATUSES)
        .eq("is_recommended", true)
        .order("display_order", { ascending: true })
        .limit(6),
      getDefaultImages(),
    ]);

  if (recommendedError) throw recommendedError;

  return {
    publishedPropertyCount: propertyCount ?? 0,
    areaCount: areaCount ?? 0,
    recommendedProperties: (recommendedRows ?? []).map((r) =>
      mapPropertyRow(r as unknown as Parameters<typeof mapPropertyRow>[0], defaults.property)
    ),
  };
}

export async function getAreas(): Promise<MetaverseAreaSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data: areas, error: areasError } = await supabase
    .from("metaverse_areas")
    .select("id, slug, name, short_description, thumbnail_url, is_recommended, is_new, display_order")
    .eq("status", "published")
    .order("display_order", { ascending: true });

  if (areasError) throw areasError;
  if (!areas || areas.length === 0) return [];

  const [{ data: propertyCounts, error: countsError }, defaults] = await Promise.all([
    supabase.from("metaverse_properties").select("area_id").in("status", PLAYER_PROPERTY_STATUSES),
    getDefaultImages(),
  ]);

  if (countsError) throw countsError;

  const countByArea = new Map<string, number>();
  for (const row of propertyCounts ?? []) {
    countByArea.set(row.area_id, (countByArea.get(row.area_id) ?? 0) + 1);
  }

  return areas.map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    shortDescription: a.short_description,
    thumbnailUrl: a.thumbnail_url ?? defaults.area,
    isRecommended: a.is_recommended,
    isNew: a.is_new,
    publishedPropertyCount: countByArea.get(a.id) ?? 0,
  }));
}

export async function getAreaById(areaId: string): Promise<MetaverseAreaDetail | null> {
  const supabase = createSupabaseServerClient();

  const [{ data: area, error: areaError }, defaults] = await Promise.all([
    supabase
      .from("metaverse_areas")
      .select("id, slug, name, short_description, description, thumbnail_url, main_image_url, is_recommended, is_new")
      .eq("id", areaId)
      .eq("status", "published")
      .maybeSingle(),
    getDefaultImages(),
  ]);

  if (areaError) throw areaError;
  if (!area) return null;

  const { data: properties, error: propertiesError } = await supabase
    .from("metaverse_properties")
    .select("id, property_code, name, area_id, main_image_url, feature_tags, status, is_recommended, is_new, metaverse_areas(name), metaverse_building_types(name)")
    .eq("area_id", areaId)
    .in("status", PLAYER_PROPERTY_STATUSES)
    .order("display_order", { ascending: true });

  if (propertiesError) throw propertiesError;

  return {
    id: area.id,
    slug: area.slug,
    name: area.name,
    shortDescription: area.short_description,
    description: area.description,
    thumbnailUrl: area.thumbnail_url ?? defaults.area,
    mainImageUrl: area.main_image_url ?? defaults.area,
    isRecommended: area.is_recommended,
    isNew: area.is_new,
    publishedPropertyCount: properties?.length ?? 0,
    properties: (properties ?? []).map((r) =>
      mapPropertyRow(r as unknown as Parameters<typeof mapPropertyRow>[0], defaults.property)
    ),
  };
}

export async function getProperties(filters?: { areaId?: string }): Promise<MetaversePropertySummary[]> {
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("metaverse_properties")
    .select("id, property_code, name, area_id, main_image_url, feature_tags, status, is_recommended, is_new, metaverse_areas(name), metaverse_building_types(name)")
    .in("status", PLAYER_PROPERTY_STATUSES)
    .order("display_order", { ascending: true });

  if (filters?.areaId) {
    query = query.eq("area_id", filters.areaId);
  }

  const [{ data, error }, defaults] = await Promise.all([query, getDefaultImages()]);
  if (error) throw error;

  return (data ?? []).map((r) => mapPropertyRow(r as unknown as Parameters<typeof mapPropertyRow>[0], defaults.property));
}

export async function getPropertyById(propertyId: string, userId: string): Promise<MetaversePropertyDetail | null> {
  const supabase = createSupabaseServerClient();

  const [
    { data: property, error: propertyError },
    { data: images, error: imagesError },
    { data: favorite, error: favoriteError },
    defaults,
  ] = await Promise.all([
    supabase
      .from("metaverse_properties")
      .select(
        "id, property_code, name, area_id, short_description, description, main_image_url, feature_tags, intended_use, status, is_recommended, is_new, metaverse_areas(name), metaverse_building_types(name)"
      )
      .eq("id", propertyId)
      .in("status", PLAYER_PROPERTY_STATUSES)
      .maybeSingle(),
    supabase
      .from("metaverse_property_images")
      .select("image_url")
      .eq("property_id", propertyId)
      .order("display_order", { ascending: true }),
    supabase
      .from("metaverse_favorites")
      .select("id")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .maybeSingle(),
    getDefaultImages(),
  ]);

  if (propertyError) throw propertyError;
  if (imagesError) throw imagesError;
  if (favoriteError) throw favoriteError;
  if (!property) return null;

  const summary = mapPropertyRow(property as unknown as Parameters<typeof mapPropertyRow>[0], defaults.property);

  let agentName: string | null = null;
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("agents:referring_agent_id(name)")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw userError;
  agentName = (userRow?.agents as unknown as { name: string } | null)?.name ?? null;

  return {
    ...summary,
    shortDescription: property.short_description,
    description: property.description,
    intendedUse: property.intended_use,
    imageUrls: (images ?? []).map((i) => i.image_url),
    agentName,
    isFavorite: !!favorite,
  };
}

export async function getPropertyScenes(propertyId: string): Promise<MetaverseScene[]> {
  const supabase = createSupabaseServerClient();

  const { data: scenes, error: scenesError } = await supabase
    .from("metaverse_tour_scenes")
    .select("id, name, image_url, thumbnail_url, description, allow_zoom, video_url, video_duration_ms")
    .eq("property_id", propertyId)
    .eq("is_published", true)
    .order("display_order", { ascending: true });

  if (scenesError) throw scenesError;
  if (!scenes || scenes.length === 0) return [];

  const { data: hotspots, error: hotspotsError } = await supabase
    .from("metaverse_scene_hotspots")
    .select("id, scene_id, title, description, position_x, position_y, icon, status")
    .in(
      "scene_id",
      scenes.map((s) => s.id)
    )
    .eq("is_published", true)
    .order("display_order", { ascending: true });

  if (hotspotsError) throw hotspotsError;

  const hotspotsByScene = new Map<string, MetaverseSceneHotspot[]>();
  for (const h of hotspots ?? []) {
    const list = hotspotsByScene.get(h.scene_id) ?? [];
    list.push({
      id: h.id,
      title: h.title,
      description: h.description,
      positionX: Number(h.position_x),
      positionY: Number(h.position_y),
      icon: h.icon,
      status: (h.status as MetaverseSceneHotspot["status"]) ?? "planned",
    });
    hotspotsByScene.set(h.scene_id, list);
  }

  return scenes.map((s) => ({
    id: s.id,
    name: s.name,
    imageUrl: s.image_url,
    thumbnailUrl: s.thumbnail_url,
    description: s.description,
    allowZoom: s.allow_zoom,
    hotspots: hotspotsByScene.get(s.id) ?? [],
    videoUrl: s.video_url,
    videoDurationMs: s.video_duration_ms,
  }));
}

export async function getFavoriteProperties(userId: string): Promise<MetaversePropertySummary[]> {
  const supabase = createSupabaseServerClient();

  const [{ data, error }, defaults] = await Promise.all([
    supabase
      .from("metaverse_favorites")
      .select(
        "property_id, metaverse_properties(id, property_code, name, area_id, main_image_url, feature_tags, status, is_recommended, is_new, metaverse_areas(name), metaverse_building_types(name))"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    getDefaultImages(),
  ]);

  if (error) throw error;

  return (data ?? [])
    .map((row) => row.metaverse_properties as unknown as Parameters<typeof mapPropertyRow>[0] | null)
    .filter((p): p is Parameters<typeof mapPropertyRow>[0] => !!p)
    .map((p) => mapPropertyRow(p, defaults.property));
}

export async function addFavorite(userId: string, propertyId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("metaverse_favorites")
    .insert({ user_id: userId, property_id: propertyId })
    .select("id")
    .maybeSingle();

  // 重複登録はunique制約違反(23505)として返るため、成功扱いにする(重複防止の意図通り)。
  if (error && error.code !== "23505") throw error;
}

export async function removeFavorite(userId: string, propertyId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("metaverse_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("property_id", propertyId);

  if (error) throw error;
}

export async function recordRecentView(userId: string, propertyId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("metaverse_recent_views").insert({ user_id: userId, property_id: propertyId });
  if (error) throw error;
}

export async function getRecentlyViewedProperties(userId: string, limit = 10): Promise<MetaversePropertySummary[]> {
  const supabase = createSupabaseServerClient();

  const { data: views, error: viewsError } = await supabase
    .from("metaverse_recent_views")
    .select("property_id, viewed_at")
    .eq("user_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(limit * 3); // 同一物件の重複視聴分を間引いた後にlimit件残すため、多めに取得する

  if (viewsError) throw viewsError;
  if (!views || views.length === 0) return [];

  const orderedUniquePropertyIds: string[] = [];
  const seen = new Set<string>();
  for (const v of views) {
    if (seen.has(v.property_id)) continue;
    seen.add(v.property_id);
    orderedUniquePropertyIds.push(v.property_id);
    if (orderedUniquePropertyIds.length >= limit) break;
  }

  const [{ data: properties, error: propertiesError }, defaults] = await Promise.all([
    supabase
      .from("metaverse_properties")
      .select(
        "id, property_code, name, area_id, main_image_url, feature_tags, status, is_recommended, is_new, metaverse_areas(name), metaverse_building_types(name)"
      )
      .in("id", orderedUniquePropertyIds)
      .in("status", PLAYER_PROPERTY_STATUSES),
    getDefaultImages(),
  ]);

  if (propertiesError) throw propertiesError;

  const byId = new Map((properties ?? []).map((p) => [p.id, p]));
  return orderedUniquePropertyIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => mapPropertyRow(p as unknown as Parameters<typeof mapPropertyRow>[0], defaults.property));
}

export type ViewEventInput = {
  sessionId?: string | null;
  userId?: string | null;
  eventType: string;
  propertyId?: string | null;
  sceneId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordViewEvent(input: ViewEventInput): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("metaverse_view_events").insert({
    session_id: input.sessionId ?? null,
    user_id: input.userId ?? null,
    event_type: input.eventType,
    property_id: input.propertyId ?? null,
    scene_id: input.sceneId ?? null,
    metadata: input.metadata ?? null,
  });
  if (error) throw error;
}

// --- 一時内覧トークン ---
//
// トークン本体(rawToken)は呼び出し側にのみ返し、DBにはSHA-256ハッシュのみ保存する。
// 推測困難性はrandomBytes(32)(256bit)により担保する。

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function getTourTokenTtlMinutes(): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_tour_settings")
    .select("tour_token_ttl_minutes")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.tour_token_ttl_minutes ?? 60;
}

export type TourSessionIssueResult = {
  rawToken: string;
  expiresAt: string;
};

export async function createTourSession(
  userId: string,
  propertyId: string,
  agentId: string | null,
  returnUrl: string | null
): Promise<TourSessionIssueResult> {
  const supabase = createSupabaseServerClient();

  // 非公開物件は発行不可(指示書11章のセキュリティ要件)。
  const { data: property, error: propertyError } = await supabase
    .from("metaverse_properties")
    .select("id")
    .eq("id", propertyId)
    .in("status", PLAYER_PROPERTY_STATUSES)
    .maybeSingle();
  if (propertyError) throw propertyError;
  if (!property) throw new Error("対象の物件が見つかりません。");

  const ttlMinutes = await getTourTokenTtlMinutes();
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  const { error } = await supabase.from("metaverse_tour_sessions").insert({
    token_hash: hashToken(rawToken),
    user_id: userId,
    agent_id: agentId,
    property_id: propertyId,
    return_url: returnUrl,
    expires_at: expiresAt,
  });

  if (error) throw error;

  return { rawToken, expiresAt };
}

// events/favorites等、外部内覧ページからの軽量な呼び出し用。validateTourSession()と違い
// アクセス回数の加算やシーン一覧の取得は行わず、トークンからuser_id/session_idだけを解決する。
export async function resolveTourSessionByToken(
  rawToken: string
): Promise<{ sessionId: string; userId: string; propertyId: string } | null> {
  const supabase = createSupabaseServerClient();
  const tokenHash = hashToken(rawToken);

  const { data: session, error } = await supabase
    .from("metaverse_tour_sessions")
    .select("id, user_id, property_id, expires_at, status")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!session) return null;
  if (session.status !== "active") return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  return { sessionId: session.id, userId: session.user_id, propertyId: session.property_id };
}

export type TourSessionValidation = {
  sessionId: string;
  userId: string;
  property: MetaversePropertySummary;
  scenes: MetaverseScene[];
};

export async function validateTourSession(rawToken: string): Promise<TourSessionValidation | null> {
  const supabase = createSupabaseServerClient();
  const tokenHash = hashToken(rawToken);

  const { data: session, error: sessionError } = await supabase
    .from("metaverse_tour_sessions")
    .select("id, user_id, property_id, expires_at, status, access_count")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session) return null;
  if (session.status !== "active") return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await supabase.from("metaverse_tour_sessions").update({ status: "expired" }).eq("id", session.id);
    return null;
  }

  await supabase
    .from("metaverse_tour_sessions")
    .update({ access_count: session.access_count + 1 })
    .eq("id", session.id);

  const [{ data: property, error: propertyError }, scenes, defaults] = await Promise.all([
    supabase
      .from("metaverse_properties")
      .select(
        "id, property_code, name, area_id, main_image_url, feature_tags, status, is_recommended, is_new, metaverse_areas(name), metaverse_building_types(name)"
      )
      .eq("id", session.property_id)
      .maybeSingle(),
    getPropertyScenes(session.property_id),
    getDefaultImages(),
  ]);

  if (propertyError) throw propertyError;
  if (!property) return null;

  return {
    sessionId: session.id,
    userId: session.user_id,
    property: mapPropertyRow(property as unknown as Parameters<typeof mapPropertyRow>[0], defaults.property),
    scenes,
  };
}

// --- 相談申込 ---

export type InquiryInput = {
  userId: string;
  agentId: string | null;
  propertyId: string | null;
  inquiryType: string;
  preferredContact: string;
  consentPersonalInfo: boolean;
  consentAgentShare: boolean;
  preferredDatetime?: string | null;
  budget?: string | null;
  purpose?: string | null;
  memo?: string | null;
};

export async function createInquiry(input: InquiryInput): Promise<string> {
  if (!input.consentPersonalInfo || !input.consentAgentShare) {
    throw new Error("個人情報の取り扱い・担当代理店への共有について同意が必要です。");
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_inquiries")
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      property_id: input.propertyId,
      inquiry_type: input.inquiryType,
      preferred_contact: input.preferredContact,
      consent_personal_info: input.consentPersonalInfo,
      consent_agent_share: input.consentAgentShare,
      preferred_datetime: input.preferredDatetime ?? null,
      budget: input.budget ?? null,
      purpose: input.purpose ?? null,
      memo: input.memo ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export type InquirySummary = {
  id: string;
  inquiryType: string;
  status: "new" | "contacted" | "in_progress" | "closed";
  propertyName: string | null;
  createdAt: string;
};

export async function getInquiriesForUser(userId: string): Promise<InquirySummary[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_inquiries")
    .select("id, inquiry_type, status, created_at, metaverse_properties(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    inquiryType: r.inquiry_type,
    status: r.status as InquirySummary["status"],
    propertyName: (r.metaverse_properties as unknown as { name: string } | null)?.name ?? null,
    createdAt: r.created_at,
  }));
}
