import { getAgencyIntegrationSettings } from "@/lib/agents";

const ERROR_MESSAGES: Record<string, string> = {
  agency_not_linked: "この代理店アカウントはまだ連携されていません。運営までお問い合わせください。",
  agency_inactive: "この代理店アカウントは現在停止中です。運営までお問い合わせください。",
  sso_expired: "ログイン用リンクの有効期限が切れました。もう一度お試しください。",
  sso_replayed: "このログイン用リンクはすでに使用されています。もう一度お試しください。",
  sso_disabled: "現在、代理店ポータルへのログインは停止中です。",
};

export default async function AgencyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const settings = await getAgencyIntegrationSettings();
  const launchUrl = `${settings.sso_issuer_url.replace(/\/$/, "")}/agent/sso_launch.php?aud=${encodeURIComponent(settings.sso_audience)}`;

  return (
    <div className="space-y-6 text-center">
      <h1 className="text-xl font-bold">代理店ポータル</h1>
      {error && (
        <p className="rounded-lg border border-crimson/40 bg-crimson/10 px-4 py-3 text-sm text-parchment">
          {ERROR_MESSAGES[error] ?? "ログインできませんでした。もう一度お試しください。"}
        </p>
      )}
      <p className="text-sm text-parchment-dim">
        代理店マイページ(sengoku-ai.com)にログインした状態で、そちらから「外部ポータルを開く」を選択してください。
      </p>
      <a
        href={launchUrl}
        className="inline-block rounded-lg border border-gold/40 bg-gradient-to-b from-crimson to-crimson-dark px-6 py-2.5 text-sm font-semibold text-parchment"
      >
        代理店マイページを開く
      </a>
    </div>
  );
}
