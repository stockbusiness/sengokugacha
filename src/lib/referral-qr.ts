import QRCode from "qrcode";

// 代理店専用URL(要件書5章「代理店専用URL・QR」)をQRコード画像(data URL)に変換する。
export async function generateReferralQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 320 });
}
