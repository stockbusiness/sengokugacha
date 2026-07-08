-- リッチメニューの「遊び方」ハブから参照する、FAQとお知らせのテーブル。
-- どちらも管理画面から追加・編集・削除できる想定(法的ページと同様、
-- RLSは有効化のみでポリシーを設けず、サーバー側のservice roleクライアントからのみ操作する)。

create table faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null unique,
  answer text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table faqs enable row level security;

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table announcements enable row level security;

insert into faqs (question, answer, display_order) values
  ('石高・戦功・ガチャ券は何に使いますか?', '石高と戦功はゲーム内の実績を示す数値です。ガチャ券は「購入」画面で消費してガチャを引く際に使用します。', 1),
  ('国を制圧するにはどうすればよいですか?', 'ガチャで、その国に対応する3種類(足軽級・武将級・大名級)の武将をすべて集めると、その国が制圧されたことになります。', 2),
  ('地方コンプとは何ですか?', 'ひとつの地方に属するすべての国を制圧すると「地方コンプ」となり、石高ボーナスと称号が付与されます。', 3),
  ('天下統一はどうすれば挑戦できますか?', '一定数の国を制圧すると、最終国「美濃国」への挑戦権が解放されます。美濃国を制圧すると天下統一達成となります。', 4)
on conflict (question) do nothing;
