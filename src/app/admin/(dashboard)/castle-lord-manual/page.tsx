import Link from "next/link";

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "城主プランとは",
    body: (
      <>
        <p>
          「全国お城プロジェクト」の一環として、特定の城・地域を担当する「城主」が、その城の土地区画を
          販売し、地域を運営していく仕組みです。城主は土地を仕入れて転売するのではなく、運営会社(本部)が
          管理・販売する区画について、契約に基づく販売枠と地域運営の役割を持ちます。
        </p>
        <p className="font-semibold text-amber-700 dark:text-amber-400">
          重要: 現時点では、実際の決済有効化・区画公開はまだ行っていません。「土地が提供する具体的な利用権」の
          法務確定が済むまでは、Stripe本番キーの設定や、城・区画を公開状態にする操作を行わないでください。
        </p>
        <p>登場する役割は次の4つです。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>本部担当者/本部管理者</strong>: この管理画面を操作する運営スタッフ。権限の違いは「権限について」の章を参照。</li>
          <li><strong>城主候補・正式城主</strong>: 城主プランに申し込み、審査を経て担当城の区画を販売・運営する人。アプリのユーザーの1人。</li>
          <li><strong>代理店</strong>: 既存の紹介代理店の仕組みをそのまま使う。城主自身が代理店を兼ねることもできる。</li>
          <li><strong>購入者</strong>: アプリ経由で実際に区画を購入する一般ユーザー。</li>
        </ul>
      </>
    ),
  },
  {
    id: "flow",
    title: "全体の流れ",
    body: (
      <>
        <p>大きく分けて3つの段階があります。それぞれ詳しい手順は次章以降で説明します。</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>城主契約の受付〜有効化</strong>(「城主契約」ページ): 申込登録 → 審査 → 承認 → 入金確認 →
            研修完了 → 正式城主として有効化。有効化された瞬間に、初期の販売枠(既定30区画)が自動的に付与されます。
          </li>
          <li>
            <strong>区画の準備と販売</strong>(「城マスタ」ページ+代理店ポータル): 本部が城ごとに区画を事前登録し、
            城主契約の有効化に合わせて販売可能になる。代理店が紹介URL・QRを発行し、区画の内容をアプリ上で案内する。
            実際の購入手続きはアプリ内では行わず、外部ショップシステムで代理店がクロージングする。
          </li>
          <li>
            <strong>成約の反映〜報酬の計上〜支払</strong>(「城マスタ」「土地報酬元帳」「土地報酬支払」ページ):
            外部ショップシステムで成約したら、本部が「城マスタ」の区画一覧から手動で「販売済み」に反映する。
            現状はこの手動反映では報酬は自動計上されない(下記「まだできないこと・注意点」参照)。
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "castles",
    title: "Step1: 城の登録(「城マスタ」ページ)",
    body: (
      <>
        <p>城主プランの対象となる城をここで登録します。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>城名・都道府県を入力して「城を追加」で作成します(この時点では「下書き」状態で非公開です)。</li>
          <li>
            城の一覧から選ぶと編集画面に移動し、説明文・メイン画像URL・公開状態を設定できます。
            <strong>公開状態を「城主募集中」または「公開中」にするまで、一般ユーザーには表示されません</strong>。
          </li>
          <li>
            編集画面の下部で、その城の「区画」をまとめて下書き登録できます(件数・区画コード接頭辞・価格を指定)。
            ここで登録した区画は、城主契約が有効化されるまで販売可能になりません。
          </li>
          <li>
            城主契約が有効化されると、下書き区画のうち先頭から必要数だけ自動的に「販売可能」へ昇格します。
            そのため、<strong>城主契約を有効化する前に、必要な数以上の区画を登録しておいてください</strong>。
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "contracts",
    title: "Step2: 城主契約の受付〜有効化(「城主契約」ページ)",
    body: (
      <>
        <p>
          城主契約は9つの状態を1つずつ順番に遷移していきます。契約の詳細画面で「◯◯へ遷移」ボタンを押すと
          次の状態に進みます(状態によって、押せるボタンが変わります)。
        </p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th className="py-1 text-left font-semibold">状態</th>
              <th className="py-1 text-left font-semibold">意味</th>
              <th className="py-1 text-left font-semibold">実行できる担当者</th>
            </tr>
          </thead>
          <tbody className="align-top">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-1 pr-2">申込(下書き)</td>
              <td className="py-1 pr-2">「城主契約」ページの「新規申込を登録」から作成した直後の状態</td>
              <td className="py-1">本部担当者</td>
            </tr>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-1 pr-2">審査中</td>
              <td className="py-1 pr-2">本部が申込者と面談・審査している状態</td>
              <td className="py-1">本部担当者</td>
            </tr>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-1 pr-2">承認済み</td>
              <td className="py-1 pr-2">審査を通過。希望していた城が正式な担当城として確定する</td>
              <td className="py-1">本部担当者</td>
            </tr>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-1 pr-2">入金待ち</td>
              <td className="py-1 pr-2">城主プラン契約金の入金待ち(現状は銀行振込等を想定。Stripe決済の対象外)</td>
              <td className="py-1 font-semibold">本部管理者のみ</td>
            </tr>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-1 pr-2">研修中</td>
              <td className="py-1 pr-2">入金確認後、研修を実施している状態</td>
              <td className="py-1 font-semibold">本部管理者のみ</td>
            </tr>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-1 pr-2">有効(正式城主)</td>
              <td className="py-1 pr-2">
                研修完了。<strong>この遷移をした瞬間に初期30区画の販売枠が自動的に付与されます</strong>
              </td>
              <td className="py-1 font-semibold">本部管理者のみ</td>
            </tr>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <td className="py-1 pr-2">停止中/契約終了/解除済み</td>
              <td className="py-1 pr-2">問題発生時の一時停止、契約期間満了、契約解除</td>
              <td className="py-1 font-semibold">本部管理者のみ</td>
            </tr>
          </tbody>
        </table>
        <p>
          遷移ボタンを押すと理由の入力を求められます(任意)。全ての遷移は契約の詳細画面下部の「状態変更履歴」に
          記録され、誰がいつどんな理由で変更したか後から確認できます。
        </p>
        <p>
          本部担当者が「入金待ち」以降の遷移を実行しようとすると、エラーになります。財務・契約継続性への影響が
          大きい操作のため、本部管理者アカウントでログインし直してください。
        </p>
      </>
    ),
  },
  {
    id: "allocations",
    title: "販売枠の付与・回収",
    body: (
      <>
        <p>
          城主契約が「有効(正式城主)」になると、その城で事前登録しておいた下書き区画のうち、初期販売枠
          (既定30区画、「城主プラン設定」ページで変更可能)の分だけ自動的に「販売可能」になります。
        </p>
        <p>
          城の編集画面の下部「販売枠の付与履歴」で、いつ・誰が・何区画付与したかを確認でき、「回収する」
          ボタンで取り消すこともできます(<strong>本部管理者のみ</strong>)。回収すると、まだ売れていない
          「販売可能」の区画は「下書き」に戻ります。すでに予約・購入済みの区画には影響しません。
        </p>
      </>
    ),
  },
  {
    id: "agency-sales",
    title: "Step3: 代理店による販売",
    body: (
      <>
        <p>
          代理店(既存の紹介代理店の仕組みをそのまま利用)は、代理店ポータル(<code>/agency</code>)の
          「全国の販売可能区画を見る・紹介URLを発行する」から、どの城の区画でも紹介URL・QRコードを発行できます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>紹介URLはLINEアプリ内で該当の区画詳細ページを直接開けるリンクです。区画の内容・価格を確認してもらうためのもので、アプリ内で購入は完結しません。</li>
          <li>実際の購入手続き(クロージング)は代理店が外部のショップシステムで行います。成約したら本部に連絡し、本部が「城マスタ」の区画一覧から「販売済み」に反映します。</li>
          <li>城主自身が代理店を兼ねて自分の担当城の区画を販売することもできます(「城主本人販売」として別明細で報酬計算されます)。</li>
        </ul>
      </>
    ),
  },
  {
    id: "purchase",
    title: "購入希望者側の流れ・成約の反映",
    body: (
      <>
        <p>
          区画の購入はアプリ内では完結しません。区画情報の閲覧と、代理店へのお問い合わせ導線のみをアプリが提供します。
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>「全国のお城一覧」(<code>/castles</code>)から城・区画を選ぶ(または代理店の紹介URLから直接区画詳細ページを開く)。</li>
          <li>区画詳細ページには「購入可能」な区画に「お問い合わせはこちら」ボタンが表示される。ここから代理店に取り次がれる想定(現状は問い合わせページへのリンクのみ)。</li>
          <li>代理店が外部ショップシステムで購入手続き(クロージング)を行う。</li>
          <li>成約後、本部担当者/本部管理者が「城マスタ」の区画一覧から該当区画を「販売済みにする(外部成約)」で反映する(成約価格を入力)。反映を忘れると、その区画は「販売可能」のまま表示され続けるので注意。</li>
        </ol>
        <p className="font-semibold text-amber-700 dark:text-amber-400">
          注意: この手動反映は区画のステータスのみを変更します。報酬元帳(<code>commission_ledger</code>)へは自動計上されません。
          代理店・城主への報酬をこの経路の成約でも計上したい場合は、別途「外部成約記録」機能の追加が必要です(詳しくは「まだできないこと・注意点」参照)。
        </p>
      </>
    ),
  },
  {
    id: "commissions",
    title: "Step4: 報酬の計上〜確定〜支払",
    body: (
      <>
        <p>報酬は「土地報酬ルール」「土地報酬元帳」「土地報酬支払」の3ページで管理します。</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>土地報酬ルール</strong>: 城主・販売代理店・上位代理店/組織・地域活動・開発積立・本部への配分率(合計必ず100%)を設定します。
            下書き作成・編集・削除は本部担当者でも可能ですが、<strong>公開(実際の計算に使われるようにする操作)は本部管理者のみ</strong>実行できます。
            公開済みのルールは編集・削除できません(修正したい場合は新しいルールセットを作って公開し直してください)。
            公開済みのルールセットが1つも無い間は、区画が購入されても報酬が計上されません(画面上部に警告が表示されます)。
          </li>
          <li>
            <strong>土地報酬元帳</strong>: 区画購入が確定すると、公開中のルールに基づいて自動的に「保留」状態の報酬明細が作られます。
            一定期間(既定8日、「城主プラン設定」ページで変更可能。取消・返金に備えた猶予期間)が経過したら、
            「猶予期間経過分を確定する」ボタンで「確定済み」に変えます(<strong>本部管理者のみ</strong>)。
            <strong>自動では確定されません</strong>。定期的にこのボタンを押しに来る運用にしてください。
          </li>
          <li>
            <strong>土地報酬支払</strong>: 確定済みの報酬を受取者ごとにまとめて表示します。「支払済みにする」ボタンを押すと
            記録上「支払済み」になります(<strong>本部管理者のみ</strong>)。
            <strong>このボタンは実際の振込を行いません</strong>。銀行振込等で実際に支払った後に押してください。
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "refund",
    title: "返金・取消が起きた場合",
    body: (
      <>
        <p>
          「購入履歴」ページから土地区画の購入を返金すると(<strong>本部管理者のみ</strong>)、Stripe側の返金処理に加えて、
          次のことが自動的に行われます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>区画が再び「販売可能」に戻る(所有者情報はクリアされる)。</li>
          <li>対応する報酬明細が、まだ「保留」中なら取消、すでに「確定済み/支払済み」なら反対仕訳(マイナスの明細)が作られる(元の明細は削除されません)。</li>
        </ul>
      </>
    ),
  },
  {
    id: "roles",
    title: "権限について(本部担当者/本部管理者)",
    body: (
      <>
        <p>
          既存の共有パスワード方式をそのまま踏襲し、2つ目の共有パスワード(<code>ADMIN_PASSWORD_OPERATOR</code>環境変数)で
          「本部担当者」としてログインできます。従来の<code>ADMIN_PASSWORD</code>でログインすると「本部管理者」になります。
          ログイン中の画面右上にどちらのロールか表示されます。
        </p>
        <p>本部担当者ができないこと(すべて本部管理者が必要):</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>契約の「入金待ち」以降の遷移(入金確認・研修完了・有効化・停止・失効更新・解除)</li>
          <li>販売枠の回収</li>
          <li>土地報酬ルールの公開</li>
          <li>土地報酬の確定・支払処理</li>
          <li>土地区画・城主プランの返金</li>
          <li>城主プラン設定(価格・料率等)の変更</li>
        </ul>
      </>
    ),
  },
  {
    id: "limitations",
    title: "まだできないこと・注意点",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>初期30区画を超える段階拡張(60→100区画)は自動化されていません(将来の対応予定)。</li>
        <li>城主の活動基準・活動報告、イベント・企業協賛、区画の貸出・二次譲渡はまだ実装されていません。</li>
        <li>報酬確定・支払は自動化されておらず、本部管理者が定期的に操作する必要があります(Cron等の自動実行基盤が無いため)。</li>
        <li>組織報酬の受取先は、代理店の直属の1階層上のみです(2階層以上の按分計算はありません)。</li>
        <li>城主プラン契約金(100万円)自体はStripe決済の対象外です。銀行振込等で入金を確認したら、契約の「入金待ち→研修中」の遷移ボタンで記録してください。</li>
        <li>
          区画の購入は代理店が外部ショップシステムでクロージングする運用に変更したため、アプリ内のStripe直接購入コード
          (区画の予約〜決済〜Webhookでの自動付与)は現在使われていません(将来の直販再開に備えてコードは残しています)。
        </li>
        <li>
          <strong>
            「城マスタ」で区画を「販売済みにする(外部成約)」と反映しても、報酬元帳(<code>commission_ledger</code>)へは
            自動計上されません
          </strong>
          。外部成約分の代理店・城主報酬もシステムで計上・支払管理したい場合は、成約時に担当代理店・成約額を入力して
          自動的に報酬明細を作る「外部成約記録」機能を別途追加する必要があります。現状、外部成約分の報酬計算・支払管理は
          アプリ外(手作業)で行ってください。
        </li>
      </ul>
    ),
  },
  {
    id: "pages",
    title: "各画面の対応表",
    body: (
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-300 dark:border-zinc-700">
            <th className="py-1 text-left font-semibold">画面名</th>
            <th className="py-1 text-left font-semibold">用途</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <td className="py-1 pr-2">城マスタ</td>
            <td className="py-1">城の登録・公開状態・区画の事前登録</td>
          </tr>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <td className="py-1 pr-2">城主契約</td>
            <td className="py-1">申込登録・審査・状態遷移・履歴確認</td>
          </tr>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <td className="py-1 pr-2">城主プラン設定</td>
            <td className="py-1">プラン価格・区画標準価格・最低資格・予約有効期限・確定猶予日数等</td>
          </tr>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <td className="py-1 pr-2">土地報酬ルール</td>
            <td className="py-1">配分率の作成・公開</td>
          </tr>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <td className="py-1 pr-2">土地報酬元帳</td>
            <td className="py-1">報酬明細の一覧・確定操作</td>
          </tr>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <td className="py-1 pr-2">土地報酬支払</td>
            <td className="py-1">確定済み報酬の受取者別まとめ・支払記録</td>
          </tr>
          <tr>
            <td className="py-1 pr-2">購入履歴</td>
            <td className="py-1">土地区画の購入を含む全購入の一覧・返金処理</td>
          </tr>
        </tbody>
      </table>
    ),
  },
];

export default function CastleLordManualPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">城主プラン運用マニュアル</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          「全国お城プロジェクト」城主プランの、申込受付から報酬支払までの一連の運用手順をまとめています。
          各設定項目の詳細な意味は<Link href="/admin/help" className="text-red-700 hover:underline dark:text-red-400">使い方ガイド</Link>も参照してください。
        </p>
      </div>

      <nav className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">もくじ</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-red-700 hover:underline dark:text-red-400">
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-8">
        {SECTIONS.map((s) => (
          <section
            key={s.id}
            id={s.id}
            className="scroll-mt-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="mb-2 text-base font-bold text-zinc-900 dark:text-zinc-50">{s.title}</h2>
            <div className="space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{s.body}</div>
          </section>
        ))}
      </div>

      <div>
        <Link href="/admin" className="text-sm text-red-700 hover:underline dark:text-red-400">
          ← 管理画面トップに戻る
        </Link>
      </div>
    </div>
  );
}
