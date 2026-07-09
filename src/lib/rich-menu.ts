// LINEリッチメニュー(Messaging API)のデプロイ処理。
// 画像は管理画面(/admin/line-settings)からアップロードされたもの
// (line_settings.rich_menu_image_url)があればそれを使い、未設定の場合は
// public/rich-menu.jpg に同梱の既定画像を使う。
// 単体素材(assets/rich-menu-source/*.webp)から既定画像を作り直す手順は
// assets/rich-menu-source/README.md を参照。

export const MENU_WIDTH = 2500;
export const MENU_HEIGHT = 1686;

// public/rich-menu.jpg のレイアウト(3列×2行)と対応させる。
// 天下統一はパスポート画面・ガチャ画面から個別に導線があるため、
// リッチメニューの6枠目は新規ユーザーの離脱防止を優先し「遊び方」とした。
// 配列の並び順は rich_menu_panels.slot_index、public/rich-menu-panels/*.webp の
// ファイル名(DEFAULT_PANEL_SLUGS)と対応させる。
export const RICH_MENU_BUTTONS = [
  { label: "パスポート", path: "/" },
  { label: "ガチャ", path: "/gacha" },
  { label: "図鑑", path: "/collection" },
  { label: "日本地図", path: "/map" },
  { label: "購入", path: "/purchase" },
  { label: "遊び方", path: "/guide" },
] as const;

export const COL_WIDTHS = [834, 833, 833];
export const ROW_HEIGHT = 843;

function buildAreas(baseUrl: string) {
  return RICH_MENU_BUTTONS.map((button, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = COL_WIDTHS.slice(0, col).reduce((a, b) => a + b, 0);
    return {
      bounds: { x, y: row * ROW_HEIGHT, width: COL_WIDTHS[col], height: ROW_HEIGHT },
      action: { type: "uri" as const, uri: `${baseUrl}${button.path}` },
    };
  });
}

async function lineApiRequest(url: string, accessToken: string, init: RequestInit, errorLabel: string) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  });
  if (!res.ok) {
    throw new Error(`${errorLabel}に失敗しました: ${await res.text()}`);
  }
  return res;
}

// 既存のリッチメニューを削除し、新しいものを作成・画像アップロード・デフォルト設定まで行う。
// 戻り値: 新しいrichMenuId。
export async function deployRichMenu(
  accessToken: string,
  baseUrl: string,
  previousRichMenuId: string | null,
  customImageUrl?: string | null
): Promise<string> {
  if (previousRichMenuId) {
    await fetch(`https://api.line.me/v2/bot/richmenu/${previousRichMenuId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {
      /* 既に削除済み等は無視 */
    });
  }

  const createRes = await lineApiRequest(
    "https://api.line.me/v2/bot/richmenu",
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size: { width: MENU_WIDTH, height: MENU_HEIGHT },
        selected: true,
        name: "sengoku-passport-main",
        chatBarText: "メニュー",
        areas: buildAreas(baseUrl),
      }),
    },
    "リッチメニューの作成"
  );
  const { richMenuId } = (await createRes.json()) as { richMenuId: string };

  const imageUrl = customImageUrl || `${baseUrl}/rich-menu.jpg`;
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`リッチメニュー画像(${imageUrl})の取得に失敗しました`);
  }
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

  await lineApiRequest(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    accessToken,
    { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: imageBuffer },
    "リッチメニュー画像のアップロード"
  );

  await lineApiRequest(
    `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
    accessToken,
    { method: "POST" },
    "デフォルトリッチメニューの設定"
  );

  return richMenuId;
}
