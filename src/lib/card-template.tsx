import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// 05/06番ガイドはAI生成イラスト自体に武将名・スキル名・ステータス等が焼き込まれている前提
// だったが、AI画像生成は正確な日本語テキスト(特にDBの実データと一致する数値)を安定して
// 描画できないため、イラストはAIに任せ、テキスト・枠はnext/og(Satori+resvg)で正確に合成する。
// 日本語フォントはサーバー環境に入っている保証が無いため、常用漢字+かな+基本英数字に絞った
// サブセットフォントを明示的に埋め込む(assets/fonts/README.md参照)。

const CARD_WIDTH = 1024;
const CARD_HEIGHT = 1536;

let fontDataPromise: Promise<Buffer> | null = null;
function loadFont(): Promise<Buffer> {
  if (!fontDataPromise) {
    fontDataPromise = readFile(join(process.cwd(), "assets/fonts/NotoSansJP-Bold.woff"));
  }
  return fontDataPromise;
}

// 武将名はゴシック体だと安っぽく見えるという指摘を受け、明朝体(Shippori Mincho)を
// 名前だけに使う。ステータス等の数値・ラベルは引き続き視認性優先でゴシック体のまま。
let nameFontDataPromise: Promise<Buffer> | null = null;
function loadNameFont(): Promise<Buffer> {
  if (!nameFontDataPromise) {
    nameFontDataPromise = readFile(join(process.cwd(), "assets/fonts/ShipporiMincho-Bold.woff"));
  }
  return nameFontDataPromise;
}

export type WarlordCardData = {
  name: string;
  rarity: string;
  provinceName: string;
  skillName?: string | null;
  stats?: Record<string, unknown> | null;
  lore?: string | null;
};

type RarityTier = {
  badge: string;
  borderColor: string;
  accentColor: string;
  nameColor: string;
  cornerSize: number;
};

// 既存のGachaReveal/図鑑ページのレアリティ別配色(金=上位/紫系=中位/グレー=下位)の考え方を踏襲しつつ、
// 5段階のレアリティ表示名それぞれに専用のバッジ文字・枠色を割り当てる。SR/SSRほど枠色を明るく・
// コーナー装飾を大きくして、質感の差をはっきり付ける。
const RARITY_TIERS: Record<string, RarityTier> = {
  足軽級: { badge: "C", borderColor: "#8f8f8f", accentColor: "#4a3620", nameColor: "#f5f5f5", cornerSize: 16 },
  侍級: { badge: "UC", borderColor: "#c9c9c9", accentColor: "#4a3620", nameColor: "#f5f5f5", cornerSize: 20 },
  武将級: { badge: "R", borderColor: "#d4af37", accentColor: "#b31c1c", nameColor: "#f2d78e", cornerSize: 24 },
  軍師級: { badge: "SR", borderColor: "#d4af37", accentColor: "#b31c1c", nameColor: "#f2d78e", cornerSize: 30 },
  大名級: { badge: "SSR", borderColor: "#f2d78e", accentColor: "#b31c1c", nameColor: "#f2d78e", cornerSize: 36 },
};
const DEFAULT_TIER = RARITY_TIERS["足軽級"];

export function getRarityTier(rarity: string): RarityTier {
  return RARITY_TIERS[rarity] ?? DEFAULT_TIER;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type CornerAnchor = { top?: number; left?: number; right?: number; bottom?: number };

const CORNER_ANCHORS: CornerAnchor[] = [
  { top: -6, left: -6 },
  { top: -6, right: -6 },
  { bottom: -6, left: -6 },
  { bottom: -6, right: -6 },
];

// 参考にした市販ソシャゲ級カードとの見た目の差(高級感不足)を埋めるための装飾要素。
// 単純な単色の枠・バッジだと安っぽく見えるため、二重枠・二重リング・グロー・
// 二重ダイヤのコーナー装飾で「金属の厚み」を感じさせる。
//
// 注意: Satori(next/ogのレンダラ)は、position:absoluteな要素の中にさらに
// position:absoluteな子要素をネストすると正しく配置できない(実機検証で確認済み)。
// そのため、コーナー装飾は「ラッパーdiv+ネストした子要素」ではなく、カード本体の
// 直接の子として絶対座標を計算したdivをフラットに並べる方式にしている。
// また、inset(0や16などの一括指定)も一部のケースで無視されることが確認できたため、
// top/left/right/bottomを個別に指定する。
function cornerLayerStyle(anchor: CornerAnchor, outerSize: number, layerSize: number): Record<string, number> {
  const delta = (outerSize - layerSize) / 2;
  const style: Record<string, number> = { width: layerSize, height: layerSize };
  for (const key of Object.keys(anchor) as (keyof CornerAnchor)[]) {
    style[key] = (anchor[key] as number) + delta;
  }
  return style;
}

// AIが生成したイラスト(portraitBuffer)の上に、レアリティ別の枠・バッジ・武将名・スキル名・
// ステータス・フレーバーテキストを合成した、最終的なカード画像を返す。
export async function renderWarlordCard(portraitBuffer: Buffer, data: WarlordCardData): Promise<Buffer> {
  const [font, nameFont] = await Promise.all([loadFont(), loadNameFont()]);
  const tier = getRarityTier(data.rarity);
  const statsEntries = Object.entries(data.stats ?? {}).slice(0, 3);
  const portraitDataUri = `data:image/png;base64,${portraitBuffer.toString("base64")}`;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          display: "flex",
          position: "relative",
          background: "#0b0b0e",
          borderRadius: 28,
          overflow: "hidden",
          border: `10px solid ${tier.borderColor}`,
          boxShadow: `0 0 0 2px rgba(0,0,0,0.6), 0 0 40px 4px ${tier.borderColor}55`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portraitDataUri}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />

        {/* 写真の四隅を枠に馴染ませるビネット(単色縁取りだけだと写真と枠が浮いて見えるため)。 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background:
              "radial-gradient(ellipse 78% 70% at 50% 46%, rgba(0,0,0,0) 62%, rgba(11,11,14,0.55) 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "50%",
            display: "flex",
            background:
              "linear-gradient(to top, rgba(11,11,14,0.97) 0%, rgba(11,11,14,0.8) 45%, rgba(11,11,14,0) 100%)",
          }}
        />

        {CORNER_ANCHORS.flatMap((anchor, i) => [
          <div
            key={`${i}-outer`}
            style={{
              position: "absolute",
              display: "flex",
              background: tier.borderColor,
              transform: "rotate(45deg)",
              opacity: 0.9,
              ...cornerLayerStyle(anchor, tier.cornerSize, tier.cornerSize),
            }}
          />,
          <div
            key={`${i}-mid`}
            style={{
              position: "absolute",
              display: "flex",
              background: tier.accentColor,
              transform: "rotate(45deg)",
              ...cornerLayerStyle(anchor, tier.cornerSize, tier.cornerSize * 0.55),
            }}
          />,
          <div
            key={`${i}-dot`}
            style={{
              position: "absolute",
              display: "flex",
              background: tier.nameColor,
              borderRadius: 999,
              opacity: 0.9,
              ...cornerLayerStyle(anchor, tier.cornerSize, tier.cornerSize * 0.22),
            }}
          />,
        ])}

        <div style={{ position: "absolute", top: 28, left: 28, display: "flex" }}>
          <div
            style={{
              position: "absolute",
              top: -6,
              left: -6,
              right: -6,
              bottom: -6,
              display: "flex",
              borderRadius: 38,
              border: `1px solid ${tier.borderColor}`,
              opacity: 0.55,
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "radial-gradient(circle at 35% 30%, #26221a 0%, #0b0b0e 75%)",
              border: `4px solid ${tier.borderColor}`,
              color: tier.borderColor,
              fontSize: tier.badge.length > 2 ? 20 : 30,
            }}
          >
            {tier.badge}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 28,
            right: 28,
            display: "flex",
            alignItems: "center",
            padding: "8px 18px",
            borderRadius: 999,
            background: "linear-gradient(180deg, rgba(26,22,15,0.85) 0%, rgba(11,11,14,0.75) 100%)",
            border: `2px solid ${tier.accentColor}`,
            color: "#f5f5f5",
            fontSize: 22,
          }}
        >
          {data.provinceName}
        </div>

        <div
          style={{
            position: "absolute",
            left: 40,
            right: 40,
            bottom: 40,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Shippori Mincho",
              color: tier.nameColor,
              fontSize: 58,
              lineHeight: 1.1,
              textShadow: `0 2px 6px rgba(0,0,0,0.85), 0 0 22px ${tier.borderColor}66`,
            }}
          >
            {data.name}
          </div>

          {/* 名前の下の飾り罫(中央にダイヤ)。市販カードによくある「名前とスキルの間の仕切り」を再現。 */}
          <div style={{ display: "flex", alignItems: "center", marginTop: 10, width: 220 }}>
            <div style={{ display: "flex", height: 1, flex: 1, background: tier.borderColor, opacity: 0.7 }} />
            <div
              style={{
                display: "flex",
                width: 7,
                height: 7,
                margin: "0 8px",
                background: tier.borderColor,
                transform: "rotate(45deg)",
              }}
            />
            <div style={{ display: "flex", height: 1, flex: 1, background: tier.borderColor, opacity: 0.7 }} />
          </div>

          {data.skillName ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: 16,
                padding: "10px 18px",
                borderRadius: 10,
                background: "linear-gradient(180deg, rgba(35,29,18,0.7) 0%, rgba(11,11,14,0.6) 100%)",
                border: `2px solid ${tier.accentColor}`,
                boxShadow: `inset 0 0 0 1px ${tier.borderColor}33`,
                alignSelf: "flex-start",
              }}
            >
              <div style={{ display: "flex", color: tier.borderColor, fontSize: 22, marginRight: 12 }}>スキル</div>
              <div style={{ display: "flex", color: "#f5f5f5", fontSize: 26 }}>{data.skillName}</div>
            </div>
          ) : null}

          {statsEntries.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "row", marginTop: 20, gap: 14 }}>
              {statsEntries.map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "10px 20px",
                    borderRadius: 10,
                    background: "linear-gradient(180deg, rgba(35,29,18,0.7) 0%, rgba(11,11,14,0.6) 100%)",
                    border: `2px solid ${tier.accentColor}`,
                    boxShadow: `inset 0 0 0 1px ${tier.borderColor}33`,
                  }}
                >
                  <div style={{ display: "flex", color: "#8f8f8f", fontSize: 20 }}>{label}</div>
                  <div style={{ display: "flex", color: "#f5f5f5", fontSize: 34 }}>{String(value)}</div>
                </div>
              ))}
            </div>
          ) : null}

          {data.lore ? (
            <div style={{ display: "flex", marginTop: 20, color: "#c9c9c9", fontSize: 20, lineHeight: 1.5 }}>
              {truncate(data.lore, 46)}
            </div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: [
        { name: "Noto Sans JP", data: font, style: "normal", weight: 700 },
        { name: "Shippori Mincho", data: nameFont, style: "normal", weight: 700 },
      ],
    }
  );

  const arrayBuffer = await image.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
