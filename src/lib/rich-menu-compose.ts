import sharp from "sharp";
import { COL_WIDTHS, MENU_HEIGHT, MENU_WIDTH, ROW_HEIGHT } from "@/lib/rich-menu";

// public/rich-menu-panels/*.webp のファイル名。RICH_MENU_BUTTONS(slot_index 0〜5)と対応する。
export const DEFAULT_PANEL_SLUGS = ["passport", "gacha", "collection", "map", "shop", "guide"] as const;

const MAX_SHEET_BYTES = 950 * 1024;

// 単体パネル画像を、そのマス(約833×843px)へ「ぼかして引き伸ばした背景+
// 単体画像そのもの(無加工・無トリミング)を中央配置」という構成で収める。
// 横長・正方形などアスペクト比が異なる素材でも、歪み・トリミング・主役の
// 欠落なしに収められる(assets/rich-menu-source/README.md の合成方針と同じ)。
async function composeCell(sourceBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  const bg = await sharp(sourceBuffer)
    .resize(width, height, { fit: "cover", position: "centre" })
    .modulate({ brightness: 0.32, saturation: 0.7 })
    .blur(40)
    .toBuffer();

  const fgMeta = await sharp(sourceBuffer).metadata();
  const fgWidth = width;
  const fgHeight = Math.round((fgMeta.height ?? height) * (width / (fgMeta.width ?? width)));
  const fg = await sharp(sourceBuffer).resize(fgWidth, fgHeight, { fit: "fill" }).toBuffer();
  const top = Math.round((height - fgHeight) / 2);

  const goldLine = await sharp({
    create: { width: fgWidth, height: 2, channels: 4, background: { r: 201, g: 162, b: 39, alpha: 0.7 } },
  })
    .png()
    .toBuffer();

  return sharp(bg)
    .composite([
      { input: fg, left: 0, top },
      { input: goldLine, left: 0, top: top - 2 },
      { input: goldLine, left: 0, top: top + fgHeight },
    ])
    .png()
    .toBuffer();
}

function cellWidthForSlot(slotIndex: number): number {
  return COL_WIDTHS[slotIndex % 3];
}

// panelBuffers は slot_index(0〜5)の順に並んだ、各パネルの元画像(未加工)を渡す。
export async function composeFullRichMenuSheet(panelBuffers: Buffer[]): Promise<Buffer> {
  if (panelBuffers.length !== 6) {
    throw new Error("パネル画像は6枚必要です");
  }

  const composites = [];
  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const width = cellWidthForSlot(i);
    const cell = await composeCell(panelBuffers[i], width, ROW_HEIGHT);
    const x = COL_WIDTHS.slice(0, col).reduce((a, b) => a + b, 0);
    composites.push({ input: cell, left: x, top: row * ROW_HEIGHT });
  }

  const sheetPng = await sharp({
    create: { width: MENU_WIDTH, height: MENU_HEIGHT, channels: 3, background: { r: 10, g: 8, b: 6 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  for (const quality of [88, 78, 68, 58, 48]) {
    const jpeg = await sharp(sheetPng).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (jpeg.byteLength <= MAX_SHEET_BYTES) return jpeg;
  }

  throw new Error("リッチメニュー画像を1MB以下に圧縮できませんでした。");
}
