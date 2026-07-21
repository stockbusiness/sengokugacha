-- 千ノ国パスポート次期改修指示書 P0-2(§4.6相当)。
-- common_user.mergedの競合、customer.assignment.changed/common_user.assigned_agent.updatedの
-- 未解決分をログのみでなく永続化し、運用側で確認・再解決できるようにする。

-- ローカルの統合先ユーザーが既に存在するため自動統合をスキップしたケース。
create table common_user_merge_conflicts (
  id uuid primary key default gen_random_uuid(),
  source_common_user_id text not null,
  target_common_user_id text not null,
  source_user_id uuid not null references users(id),
  conflicting_target_user_id uuid not null references users(id),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (source_common_user_id, target_common_user_id)
);

alter table common_user_merge_conflicts enable row level security;

-- agent_code未特定、またはagentsテーブル未同期(agents.external_id不一致)で解決できな
-- かった担当代理店割当イベント。common_user_id単位で最新のpayloadのみ保持する
-- (同一ユーザーへの複数回の未解決イベントは最新のものが正となるため)。解決に成功した
-- 時点で行を削除する(存在しない=解決済み、という設計。entitlement_pending_revocations
-- と同じ「delete-on-consume」パターン)。
create table unresolved_agent_assignments (
  id uuid primary key default gen_random_uuid(),
  common_user_id text not null unique,
  reason text not null check (reason in ('agent_code_undetermined', 'agent_not_found')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table unresolved_agent_assignments enable row level security;
