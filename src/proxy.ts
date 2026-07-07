import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/admin-session";

// Next.js 16: Middleware は Proxy に名称変更(挙動は同じ)。
// ここではcookieの署名検証のみ行う「楽観的チェック」に留め、各APIルート側でも
// getAdminSession() による認可チェックを行う(DBアクセスはしないためProxyで実行して問題ない)。
async function hasValidAdminSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return false;

  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtectedAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";

  if (isProtectedAdminPage && !(await hasValidAdminSession(req))) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
