-- 管理画面の操作ログ(監査ログ)。金銭・法務・ゲーム経済に関わる重要な操作の
-- 「いつ・誰が・何をしたか」を記録する。管理者は単一の共有パスワードのままだが、
-- ログイン時に任意で担当者名を入力できるようにし、それをここに記録する。
create table admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_name text,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table admin_audit_logs enable row level security;

create index idx_admin_audit_logs_created_at on admin_audit_logs(created_at desc);
