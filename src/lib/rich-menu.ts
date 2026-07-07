// LINEリッチメニュー(Messaging API)のデプロイ処理。
// 画像は public/rich-menu.png に事前生成済みの静的ファイルを使う
// (実行時にJapanese対応フォントを含むレンダリングを行うのは負荷が大きいため、
// レイアウトを変える場合は画像を作り直して差し替える運用とする)。

const MENU_WIDTH = 2500;
const MENU_HEIGHT = 1686;

// public/rich-menu.png のレイアウト(3列×2行)と対応させる。
export const RICH_MENU_BUTTONS = [
  { label: "パスポート", path: "/" },
  { label: "ガチャ", path: "/gacha" },
  { label: "図鑑", path: "/collection" },
  { label: "日本地図", path: "/map" },
  { label: "購入", path: "/purchase" },
  { label: "天下統一", path: "/tenka-toitsu" },
] as const;

const COL_WIDTHS = [834, 833, 833];
const ROW_HEIGHT = 843;

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
  previousRichMenuId: string | null
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

  const imageRes = await fetch(`${baseUrl}/rich-menu.png`);
  if (!imageRes.ok) {
    throw new Error("リッチメニュー画像(public/rich-menu.png)の取得に失敗しました");
  }
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

  await lineApiRequest(
    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
    accessToken,
    { method: "POST", headers: { "Content-Type": "image/png" }, body: imageBuffer },
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
