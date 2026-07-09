export type ExternalLinkCategory =
  | "ai_academy"
  | "marketplace"
  | "nft_market"
  | "event"
  | "nation_builder"
  | "founding_member"
  | "other";

// 既存の外部送客リンク(external_links)にはカテゴリ列を持たせず、既存のキー名で判別する
// (指示書9章: 「カテゴリがない場合は、最小差分で追加するか、既存リンク名で判別する」)。
export const EXTERNAL_LINK_CATEGORY_BY_KEY: Record<string, ExternalLinkCategory> = {
  ai_art_school: "ai_academy",
  nft_marketplace: "nft_market",
  advisor_program: "founding_member",
  nation_builder_program: "nation_builder",
  event_reservation: "event",
};

export type ContributionStatusType = "education" | "culture" | "commerce" | "tourism" | "military";

export type ContributionCategory = {
  id: string;
  title: string;
  description: string;
  statusType: ContributionStatusType;
  icon: string;
  href: string;
};

// Ver2.2指示書8章。実際の国家ステータス計算は行わず、活動と貢献カテゴリの対応を
// 説明するUIのみを提供する。
export const CONTRIBUTION_CATEGORIES: ContributionCategory[] = [
  {
    id: "academy",
    title: "AI寺子屋",
    description: "教育力を高める活動",
    statusType: "education",
    icon: "📜",
    href: "/academy",
  },
  {
    id: "culture",
    title: "作品投稿・NFT",
    description: "文化力を高める活動",
    statusType: "culture",
    icon: "🎨",
    href: "/market",
  },
  {
    id: "market",
    title: "戦国市場",
    description: "商業力を高める活動",
    statusType: "commerce",
    icon: "🏮",
    href: "/market",
  },
  {
    id: "events",
    title: "イベント",
    description: "観光力を高める活動",
    statusType: "tourism",
    icon: "🎆",
    href: "/events",
  },
  {
    id: "gacha",
    title: "武将登用",
    description: "軍事力を高める活動",
    statusType: "military",
    icon: "⚔️",
    href: "/gacha",
  },
];
