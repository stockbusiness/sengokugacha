import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // カードテンプレート合成(src/lib/card-template.tsx)がassets/fonts/を
  // fs.readFile(process.cwd() + 相対パス)で動的に読むため、静的解析による
  // ファイルトレースが検出できない可能性がある。念のため明示的に含める。
  outputFileTracingIncludes: {
    "/api/admin/ai-image/adopt": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
