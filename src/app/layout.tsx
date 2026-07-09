import type { Metadata } from "next";
import { Cinzel, Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
import "./globals.css";

// 和文メイン(游明朝相当)。OS依存の游明朝ではなくWebフォントとして確実に描画するため、
// 同系統の明朝体であるShippori Minchoを採用している(画面デザインガイドのフォント方針を踏襲)。
const headingFont = Shippori_Mincho({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["600", "800"],
});

const bodyFont = Noto_Sans_JP({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

// 英字ロゴ・アイキャッチ見出し用(画面デザインガイドの「英字: Cinzel / Trajan Pro」に対応。
// Trajan Proはライセンス上Webフォント化できないため、同系統のCinzelを採用)。
const accentFont = Cinzel({
  variable: "--font-accent",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "戦国パスポート",
  description: "戦国経済圏OS 戦国パスポート",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      data-theme="sengoku"
      className={`${headingFont.variable} ${bodyFont.variable} ${accentFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
