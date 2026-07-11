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

      <div className="grid gap-3 sm:grid-cols-3">
        <HubCard href="/admin/metaverse/areas" title="エリア管理" description="城下町のエリア・建物タイプの登録・編集" />
        <HubCard href="/admin/metaverse/properties" title="区画・物件管理" description="物件の登録・編集・内覧シーン・画像管理" />
        <HubCard href="/admin/metaverse/inquiries" title="問い合わせ管理" description="相談申込の一覧・対応状況の更新" />
        <HubCard href="/admin/metaverse/tour-sessions" title="外部内覧セッション" description="発行された一時内覧トークンの利用状況" />
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
