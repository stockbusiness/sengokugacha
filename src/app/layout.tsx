import type { Metadata } from "next";
import { Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
import "./globals.css";

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
      className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
