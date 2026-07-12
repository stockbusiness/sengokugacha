// クライアントから生のテーブル名/カラム名を受け取らないよう、サーバー側で
// 生成対象エンティティをホワイトリスト化する(管理セッションを任意テーブル書き込みの
// 手段にしないため)。

export type AiImageEntityType =
  | "warlord"
  | "metaverse_area"
  | "metaverse_property"
  | "metaverse_scene"
  | "metaverse_map";

export type AiImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export type AiImageTarget = {
  table: string;
  bucket: "warlord-images" | "metaverse-images";
  pathPrefix: string;
  defaultSize: AiImageSize;
  resolveColumn: (target?: string | null) => string;
};

export const AI_IMAGE_TARGETS: Record<AiImageEntityType, AiImageTarget> = {
  warlord: {
    table: "warlords",
    bucket: "warlord-images",
    pathPrefix: "warlords",
    defaultSize: "1024x1536",
    resolveColumn: () => "image_url",
  },
  metaverse_area: {
    table: "metaverse_areas",
    bucket: "metaverse-images",
    pathPrefix: "areas",
    defaultSize: "1024x1024",
    resolveColumn: (t) => (t === "main" ? "main_image_url" : "thumbnail_url"),
  },
  metaverse_property: {
    table: "metaverse_properties",
    bucket: "metaverse-images",
    pathPrefix: "properties",
    defaultSize: "1536x1024",
    resolveColumn: () => "main_image_url",
  },
  metaverse_scene: {
    table: "metaverse_tour_scenes",
    bucket: "metaverse-images",
    pathPrefix: "scenes",
    defaultSize: "1536x1024",
    resolveColumn: () => "image_url",
  },
  metaverse_map: {
    table: "metaverse_maps",
    bucket: "metaverse-images",
    pathPrefix: "maps",
    defaultSize: "1024x1024",
    resolveColumn: () => "image_url",
  },
};

export function isAiImageEntityType(value: unknown): value is AiImageEntityType {
  return typeof value === "string" && value in AI_IMAGE_TARGETS;
}

export function isWarlordEntity(entityType: AiImageEntityType): boolean {
  return entityType === "warlord";
}
