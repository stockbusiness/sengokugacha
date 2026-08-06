-- 城主・土地の販売導線(案1: 区画の相談申込 / 案2: 解放通知 / 案3: 内覧との接続)。
--
-- いずれも「購入フローが未接続のままでも効く仕掛け」として追加するもの。
-- 決済・購入関連のテーブルには一切手を入れていない。

-- ------------------------------------------------------------
-- 案3: 城の区画(castle_plots)とメタバース内覧物件(metaverse_properties)の接続。
-- ------------------------------------------------------------
-- 既存のメタバース内覧(3Dシーン・ホットスポット・お気に入り・閲覧ログ)は
-- metaverse_properties を軸に作られているが、実際に販売している城の区画
-- (castle_plots)とは今まで何も繋がっていなかった。ここを1本の外部キーで繋ぐと、
-- 区画詳細から既存の内覧体験をそのまま再利用できる。
--
-- 多対1ではなく1対1相当(1区画に内覧物件1件)とし、対応が無い区画はnullのまま。
-- 内覧物件が削除された場合に区画まで消えてはならないので on delete set null。
alter table castle_plots
  add column if not exists property_id uuid references metaverse_properties(id) on delete set null;

comment on column castle_plots.property_id is
  '内覧用のメタバース物件。nullならこの区画には内覧コンテンツが無い(区画詳細に内覧ボタンを出さない)。';

create index if not exists idx_castle_plots_property_id on castle_plots (property_id);

-- ------------------------------------------------------------
-- 案1: 相談申込(metaverse_inquiries)を城の区画にも紐づける。
-- ------------------------------------------------------------
-- 相談申込のパイプライン(new → contacted → in_progress → closed、担当代理店の
-- 割り当て、対応履歴)は既に動いているので、新しいテーブルは作らずに
-- 「どの区画についての相談か」だけを足す。property_id と castle_plot_id は
-- どちらも任意で、区画からの相談では castle_plot_id が入る。
alter table metaverse_inquiries
  add column if not exists castle_plot_id uuid references castle_plots(id) on delete set null;

comment on column metaverse_inquiries.castle_plot_id is
  '相談対象の城の区画。メタバース物件からの相談ではnull(その場合はproperty_idが入る)。';

create index if not exists idx_metaverse_inquiries_castle_plot on metaverse_inquiries (castle_plot_id, created_at);

-- ------------------------------------------------------------
-- 案2: 城の解放通知の送信台帳。
-- ------------------------------------------------------------
-- 国の制圧・地方の制覇で城が解放された瞬間にLINE個別通知を送るが、
-- 送信そのものには冪等キーが無い(line-push.ts のコメント参照)ため、
-- 「この城について、このユーザーへ既に送ったか」をこの台帳で判定する。
-- (user_id, castle_id) の一意制約により、同じ城の解放通知は生涯1回だけになる。
create table if not exists castle_unlock_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  castle_id uuid not null references castles(id) on delete cascade,
  -- 何をきっかけに解放されたか(province_conquest / region_completion)。運用時の追跡用。
  trigger_kind text not null,
  notified_at timestamptz not null default now(),
  unique (user_id, castle_id)
);

alter table castle_unlock_notifications enable row level security;

create index if not exists idx_castle_unlock_notifications_user
  on castle_unlock_notifications (user_id, notified_at);
