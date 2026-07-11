import Link from "next/link";

export default function MetaverseHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">メタバース内覧管理</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          城下町デジタル内覧機能(エリア・物件・内覧シーン・問い合わせ等)を管理します。価格・権利内容・特典は
          社内記録用の項目としてのみ保持し、アプリ・外部内覧ページには表示されません。
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">はじめての設定手順</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>「エリア管理」でエリア(城下町の区画)と建物タイプを登録する</li>
          <li>「区画・物件管理」でエリアに紐づく物件(区画)を登録する</li>
          <li>物件編集ページで内覧シーン(画像・動画)と説明ポイントを登録し、「公開」にする</li>
          <li>物件本体も「公開」または「近日公開」にする(下書きのままではLIFF・外部内覧ページに表示されない)</li>
          <li>問い合わせが来たら「問い合わせ管理」で対応状況を更新する</li>
        </ol>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-600">
          「外部内覧セッション」「閲覧分析」は運用が始まってから確認するページです(設定は不要)。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <HubCard href="/admin/metaverse/areas" title="エリア管理" description="城下町のエリア・建物タイプの登録・編集。画像アップロード、共通デフォルト画像の設定もここから" />
        <HubCard href="/admin/metaverse/properties" title="区画・物件管理" description="物件の登録・編集・内覧シーン(画像/動画)・説明ポイント・画像ギャラリー管理" />
        <HubCard href="/admin/metaverse/inquiries" title="問い合わせ管理" description="LIFF内フォームからの相談申込の一覧・対応状況の更新" />
        <HubCard href="/admin/metaverse/tour-sessions" title="外部内覧セッション" description="発行された一時内覧トークンの有効期限設定・利用状況の確認" />
        <HubCard href="/admin/metaverse/analytics" title="閲覧分析" description="人気物件・内覧完了率・相談転換率・代理店別実績の簡易集計" />
      </div>
    </div>
  );
}

function HubCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <p className="font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
    </Link>
  );
}
