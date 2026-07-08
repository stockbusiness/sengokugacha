import * as Sentry from "@sentry/nextjs";

// NEXT_PUBLIC_SENTRY_DSNが未設定の間は初期化しない(Sentryアカウント未作成のデプロイでも動作する)。
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
