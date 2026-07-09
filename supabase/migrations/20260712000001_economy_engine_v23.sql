-- 戦国パスポート Ver2.3: OVE・国家貢献・経済圏エンジン フェーズ。
-- 国家貢献ポイントの取得元(武将登用・AI寺子屋・イベント参加・市場閲覧・ログイン)を
-- 時系列で記録するための活動ログ。users.contribution_points(Ver2.0で追加済み)は
-- 引き続き「総国家貢献」の集計値として使い、月間/本日の集計はこのテーブルから行う。

create table user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  activity_type text not null, -- 'gacha_draw' | 'academy_view' | 'market_view' | 'event_view' | 'login'
  point int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_user_activity_user_id_created_at on user_activity(user_id, created_at);

alter table user_activity enable row level security;
