import * as Sentry from "@sentry/nextjs";

// SENTRY_DSNが未設定の間は初期化しない(Sentryアカウント未作成のデプロイでも動作する)。
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
