import Link from "next/link";

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "この管理画面について",
    body: (
      <>
        <p>
          「戦国パスポート」アプリの裏側(ゲーム内容・決済・LINE連携)を設定するための画面です。
          全担当者が同じパスワードでログインします(個人アカウントはありません)。誰がいつ何を変更したかは
          「操作ログ」ページに記録されるので、作業前にログイン画面で担当者名を入力しておくと後から追跡しやすくなります。
        </p>
        <p>
          迷ったときの原則: <strong>公開前の設定は必ず一度保存して見た目を確認</strong>し、
          <strong>取り消せない操作(返金・LINE一斉配信など)には必ず確認メッセージが出ます</strong>ので、
          内容をよく読んでから実行してください。
        </p>
      </>
    ),
  },
  {
    id: "dashboard",
    title: "管理画面(トップページ)",
    body: (
      <>
        <p>ログイン後の最初の画面です。数値は自動集計で、直接編集はできません。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>「本日アクセスした人数」「直近7日でアクセスした人数」= その期間にアプリを開いたユーザーの人数です。</li>
          <li>各カードをクリックすると、対応する設定ページに移動します。</li>
        </ul>
      </>
    ),
  },
  {
    id: "line-settings",
    title: "LIFF/LINE設定",
    body: (
      <>
        <p>
          このページでは<strong>2種類の別々のLINE設定</strong>を扱います。混同しやすいので注意してください。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>LIFFログイン用チャネル</strong>: ユーザーがアプリを開いたときの本人確認(ログイン)に使う設定です。
          </li>
          <li>
            <strong>LINE公式アカウント(Messaging API)チャネル</strong>:
            リッチメニュー(トーク画面下部の6分割メニュー)の配信や、一斉配信メッセージの送信に使う、別の設定です。
          </li>
        </ul>
        <p>
          リッチメニューの画像は「アップロード→デプロイ」の2段階です。画像をアップロードしただけではLINEには反映されず、
          必ず「デプロイ」ボタンまで押す必要があります。
        </p>
      </>
    ),
  },
  {
    id: "line-broadcast",
    title: "LINE一斉配信",
    body: (
      <>
        <p className="font-semibold text-red-700 dark:text-red-400">
          送信すると取り消せません。送信前に必ずプレビューし、内容を見直してください。
        </p>
        <p>
          配信した通数はLINE公式アカウントの無料/有料メッセージ数の上限にカウントされます。上限を超えると
          追加費用が発生する場合があるため、大人数への配信前はLINE Official Account Manager側で残り通数を確認してください。
        </p>
      </>
    ),
  },
  {
    id: "gacha-config",
    title: "ガチャ設定",
    body: (
      <>
        <p>1日に引けるガチャの回数を設定します。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>base(通常)</strong>: 普段の1日の上限回数です。
          </li>
          <li>
            <strong>override(イベント時)</strong>: 入力すると、期間中はbaseの代わりにこちらが使われます
            (baseに足し算されるわけではありません)。
          </li>
          <li>
            プリセットボタン(通常/小規模イベント/大型イベント)を押すと、override欄が自動的に上書きされます。
            手入力した値が消えることがあるので、カスタム設定中は使わないでください。
          </li>
          <li>「イベント終了日時」を空欄のままにすると、手動で戻すまでイベント設定が続きます。</li>
        </ul>
      </>
    ),
  },
  {
    id: "gacha-rates",
    title: "排出率設定",
    body: (
      <>
        <p>
          「制圧済みの国の数」に応じて、レア(大名級)・中間(武将級)の排出率が段階的に変わる仕組みです。
          ここで設定した数値は、抽選そのものと、ユーザー向けの排出率公開ページ(/rates、法律で開示が必要な情報)の
          両方に使われます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            「階層適用の上限国数」が空欄の行は「それ以降すべて」を意味します。<strong>必ず一番最後の階層にしてください</strong>
            (途中の行を空欄にすると、それ以降の階層が使われなくなります)。
          </li>
          <li>数値は0〜1の割合で保存されますが、画面には%(パーセント)で表示されます。</li>
          <li>コモン(足軽級)の排出率は「100% − レア% − 中間%」で自動計算されます。</li>
        </ul>
      </>
    ),
  },
  {
    id: "gacha-animations",
    title: "動画演出",
    body: (
      <>
        <p>ガチャを引いた直後に再生する動画を、レアリティ(足軽級/武将級/大名級)ごとに登録します。</p>
        <p className="font-semibold">動画が選ばれる順番:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>「状態=公開」かつ「レアリティが一致」かつ「公開期間内」の動画だけが候補になる</li>
          <li>候補が複数あれば「優先度」が一番高いものだけに絞る</li>
          <li>それでも複数残れば「weight」の比率でランダムに1本選ぶ(100:50なら約2:1)</li>
          <li>該当する動画が1本もなければ「デフォルト動画」にフォールバックする</li>
        </ol>
        <p>
          「スキップ表示開始」「最低再生時間」はミリ秒(ms)単位です(1000ms=1秒)。
          動画ファイルはMP4・縦型(9:16)・10秒以内を目安にしてください。
        </p>
      </>
    ),
  },
  {
    id: "provinces",
    title: "国マスタ",
    body: (
      <>
        <p>日本地図に表示される66国+最終国(美濃)の名前・地方・並び順を編集します。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>「解放条件(制圧数)」は最終国にのみ表示され、他の国を何か国制圧したら挑戦できるようになるかの設定です。</li>
          <li>
            「メタバース関連項目(将来用)」は、現時点ではゲーム画面のどこにも表示されない準備中の項目です。
            入力しても今のアプリの動きは変わりません。
          </li>
          <li>国とスロット(コモン/中間/レア)の組み替えはこの画面からはできません(武将マスタ側でも同様です)。</li>
        </ul>
      </>
    ),
  },
  {
    id: "warlords",
    title: "武将マスタ",
    body: (
      <>
        <p>各武将の名前・画像・逸話(せりふ的なテキスト)を編集します。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>「レアリティ」は表示名の自由入力です。実際の排出確率はスロット(コモン/中間/レア)側で決まるため、
            見た目の表示名がずれないよう、既存の値(足軽級/武将級/大名級)に揃えてください。</li>
          <li>画像はアップロードすると自動でLINE表示用にリサイズされます。</li>
          <li>「ステータス(JSON)」は将来の機能用の項目で、現在はゲーム画面のどこにも表示されません。空欄のままで問題ありません。</li>
        </ul>
      </>
    ),
  },
  {
    id: "metaverse",
    title: "メタバース内覧",
    body: (
      <>
        <p>
          「戦国城下町デジタル内覧」機能の管理です。将来のメタバース空間に建設予定の武家屋敷等を、画像ベースで
          プレイヤーが見学できます。<strong>価格・権利内容・特典は入力欄はありますが社内記録専用で、プレイヤー画面には一切表示されません</strong>
          (販売・説明はアプリ外の説明会等で行う方針のため)。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>登録の順番: エリア → 建物タイプ → 物件(区画) → 内覧シーン(画像) → 説明ポイント、の順に登録すると迷いません。</li>
          <li>物件・シーンは「公開」にするまでプレイヤー画面に表示されません。下書きの間に確認しながら準備できます。</li>
          <li>
            「全画面で内覧する」を押すと、個人情報を含まない一時的なリンク(既定60分で失効)が発行され、外部ブラウザで開きます。
            この有効期限は「外部内覧セッション」ページから変更できます。
          </li>
          <li>問い合わせ(相談申込)は担当代理店に自動で紐づきます(既存の紹介代理店の仕組みをそのまま利用)。</li>
          <li>「閲覧分析」は直近の閲覧ログからの簡易集計です。厳密な統計処理ではなく、参考値としてご覧ください。</li>
        </ul>
      </>
    ),
  },
  {
    id: "agents",
    title: "代理店管理",
    body: (
      <>
        <p>
          代理店(紹介パートナー)を登録すると、専用の紹介コード付きURLが発行されます。このURL経由で登録したユーザーは
          その代理店に紐づき、購入があると「売上ログ」に記録されます。
        </p>
        <p>
          「ランク」(アドバイザー/ディレクター/エージェント)は現時点では表示のみで、報酬率の自動計算などには
          まだ使われていません(将来の機能拡張用です)。
        </p>
        <p>
          外部の代理店システム(sengoku-ai.com)との連携設定は「外部代理店システム連携設定」から行います。
          設定するとsengoku-ai.com側の代理店データがこのアプリにも同期され、代理店本人が
          sengoku-ai.com経由でSSOログインし、自分の紹介URL・実績を確認できる専用ポータル(<code>/agency</code>)が使えるようになります。
          階層(親子関係)は表示のみで、報酬の按分計算には使われません。
        </p>
      </>
    ),
  },
  {
    id: "links",
    title: "送客導線",
    body: (
      <p>
        AIアート教室・NFTマーケット・評議員募集など、外部サイトへの遷移URLを設定します。
        URLを空欄のまま保存すると、その項目はアプリ画面に表示されなくなります(項目ごと非表示)。
      </p>
    ),
  },
  {
    id: "payment-settings",
    title: "決済設定",
    body: (
      <>
        <p>
          Stripe(決済代行サービス)のAPIキーと、購入パック(石高パック・ガチャ券パック)の価格を設定します。
          キー系の項目は空欄のまま保存すると「変更しない」扱いになります(誤って消してしまう心配はありません)。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Webhook署名シークレットは、Stripe管理画面側で <code>/api/stripe/webhook</code> を登録したときに発行される値を貼り付けます。</li>
          <li>
            パックの「価格(円)」と「付与量」は別々の数値です。入力ミスがあると、実質的な交換レートが
            意図しない値になってしまうので、保存前に必ず見直してください(自動チェックはありません)。
          </li>
          <li>「利用上限」は1ユーザーが暦月内に購入できる合計金額の上限です。空欄なら上限なしです。</li>
        </ul>
      </>
    ),
  },
  {
    id: "purchases",
    title: "購入履歴",
    body: (
      <p>
        購入の一覧です。「返金」ボタンを押すとStripe側で実際に返金処理が行われ、付与済みの石高/ガチャ券も
        取り消されます(取り消し後の残高がマイナスになる場合は0になります)。取り消せない操作なので、
        確認メッセージの内容をよく読んでから実行してください。
      </p>
    ),
  },
  {
    id: "agent-sales",
    title: "売上ログ",
    body: (
      <>
        <p>代理店経由の購入記録の一覧です。CSV出力もできます。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            「支払い状況」の切り替えボタンは、<strong>実際に送金する機能ではありません</strong>。「支払い済みにした」という
            記録を残すだけの手動チェックです。実際の振込は別途、銀行振込などで行ってください。
          </li>
          <li>金額は売上総額です。代理店への実際の報酬額(手数料率を反映した額)はこの画面では計算されないため、別途手動で計算してください。</li>
        </ul>
      </>
    ),
  },
  {
    id: "achievements",
    title: "実績ログ",
    body: <p>「地方コンプリート(8地方のいずれかを制覇)」「天下統一達成」をしたユーザーの記録です。表示のみで編集はできません。</p>,
  },
  {
    id: "users",
    title: "ユーザー検索",
    body: (
      <>
        <p>サポート対応時にユーザーを特定したり、所持数を確認するための検索画面です。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>「石高」= ガチャを引くための課金通貨、「戦功」= 国家貢献ポイントです。</li>
          <li>
            「編集」から創設メンバー/建国メンバーの区分と、それに紐づく国民証表示用の項目(番号・区画IDなど)を
            手動で設定できます。これらは自由入力欄で、入力形式の決まりはありません。
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "legal-pages",
    title: "法的ページ",
    body: (
      <p>
        特商法表記・利用規約・プライバシーポリシー・お問い合わせページの文面を編集します。
        <strong>保存すると即座に本番ページに反映されます</strong>(下書き機能はありません)。
        テンプレート内の【 】で囲まれた部分は必ず実際の内容に置き換え、法務担当者の確認を受けてから保存してください。
      </p>
    ),
  },
  {
    id: "faqs",
    title: "FAQ",
    body: <p>「遊び方」画面から遷移するFAQページ(/faq)の内容を編集します。「表示順」の数値が小さいほど上に表示されます。</p>,
  },
  {
    id: "announcements",
    title: "お知らせ",
    body: (
      <p>
        「遊び方」画面から遷移するお知らせページ(/announcements)に表示する記事を追加します。
        公開日時の新しい順に並びます。
      </p>
    ),
  },
  {
    id: "audit-logs",
    title: "操作ログ",
    body: (
      <p>
        金銭・法務・ゲーム経済に関わる主要な操作のみを記録した履歴です(国/武将マスタ等の軽微な編集は対象外)。
        担当者名はログイン時の自己申告のため、共有パスワード運用下では厳密な本人確認ではない点に注意してください。
      </p>
    ),
  },
];

const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "石高(こくだか)", meaning: "ガチャを引くために使う課金通貨。Stripe決済で購入する。" },
  { term: "ガチャ券", meaning: "有料ガチャを1回引くためのチケット。購入または特典で入手する。" },
  { term: "戦功(せんこう)", meaning: "国家貢献ポイント。ガチャを引く・寺子屋を利用するなどで貯まる。" },
  { term: "城主(じょうしゅ)", meaning: "アプリ内でのユーザーの呼び名。" },
  { term: "国", meaning: "日本地図上の66国+最終国(美濃)。ガチャで3体の武将を集めると「制圧」扱いになる。" },
  { term: "スロット(コモン/中間/レア)", meaning: "各国に3体いる武将の抽選区分。表示名(足軽級/武将級/大名級)とは別に、抽選ロジック側で使われる内部区分。" },
  { term: "地方コンプ", meaning: "同じ地方(東北・関東など)の全ての国を制圧すること。称号と石高ボーナスが付与される。" },
  { term: "天下統一", meaning: "最終国(美濃)を制圧し、代表武将を選んで達成する、ゲームの最終目標。" },
  { term: "創設メンバー/建国メンバー", meaning: "特別な会員区分。国民証への表示や優先案内などに使われる(ユーザー検索ページから手動設定)。" },
];

export default function AdminHelpPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">使い方ガイド</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          各設定ページの目的と、わかりにくい項目の意味をまとめました。ページ上部のメニューから該当ページに移動できます。
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
          <a href="#glossary" className="text-red-700 hover:underline dark:text-red-400">
            用語集
          </a>
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

        <section
          id="glossary"
          className="scroll-mt-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <h2 className="mb-3 text-base font-bold text-zinc-900 dark:text-zinc-50">用語集</h2>
          <dl className="space-y-2 text-sm">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="font-semibold text-zinc-900 sm:w-48 sm:shrink-0 dark:text-zinc-50">{g.term}</dt>
                <dd className="text-zinc-600 dark:text-zinc-400">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div>
        <Link href="/admin" className="text-sm text-red-700 hover:underline dark:text-red-400">
          ← 管理画面トップに戻る
        </Link>
      </div>
    </div>
  );
}
