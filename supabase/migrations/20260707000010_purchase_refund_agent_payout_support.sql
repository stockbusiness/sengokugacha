-- 実運用の🟡優先項目(返金対応・使いすぎ防止・代理店報酬支払い管理・問い合わせ窓口)に必要なカラムを追加する。

-- 返金処理時に、購入時点で実際に付与した数量(石高量/ガチャ券枚数)を正確に取り消せるよう、
-- 付与量を購入レコード自体に保存する(後からパック内容の設定金額が変わっても影響を受けない)。
alter table purchases add column grant_amount int not null default 0;

alter table purchases drop constraint purchases_status_check;
alter table purchases add constraint purchases_status_check
  check (status in ('pending', 'completed', 'failed', 'refunded'));

-- 使いすぎ防止のための任意の月間購入上限(円)。nullの場合は上限なし。
alter table payment_settings add column monthly_spending_cap_yen int;

-- 代理店報酬の支払い状況(手動運用の請求書発行・振込を前提に、済/未のフラグのみ管理する)。
alter table agent_sales add column payout_status text not null default 'unpaid'
  check (payout_status in ('unpaid', 'paid'));
alter table agent_sales add column paid_at timestamptz;

-- お問い合わせ窓口ページ(legal_pagesの仕組みをそのまま流用する)。
insert into legal_pages (slug, title, body) values
  (
    'support',
    'お問い合わせ',
    E'ご不明点・不具合等がございましたら、以下までご連絡ください。\n\n【メールアドレスやLINE公式アカウントのお問い合わせ先を管理画面(/admin/legal-pages)から入力してください】'
  )
on conflict (slug) do nothing;
