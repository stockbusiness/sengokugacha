-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 §10(未同期ユーザーイベント保持)。

-- §10.1: 担当代理店解決処理(handleAssignedAgentUpdated)は、common_user_idに対応する
-- ローカルユーザーがまだ存在しない場合、これまでイベントを破棄していた(ユーザーが後日
-- 登録・同期された時点で再処理する手段が無かった)。reasonにuser_not_foundを追加し、
-- この場合もunresolved_agent_assignmentsへ保存するようにする。
alter table unresolved_agent_assignments drop constraint unresolved_agent_assignments_reason_check;
alter table unresolved_agent_assignments add constraint unresolved_agent_assignments_reason_check
  check (reason in ('agent_code_undetermined', 'agent_not_found', 'user_not_found'));

-- §10.2: common_user.merged処理(handleCommonUserMerged)は、統合元(source)のcommon_user_id
-- に対応するローカルユーザーがまだ存在しない場合、これまでイベントを「無関係なイベント」
-- として破棄していた(実際には単に未同期なだけの可能性がある)。統合元ユーザーが後日
-- 登録・同期された時点で再処理できるよう、未解決イベントとして保存する。
-- 既存のcommon_user_merge_conflicts(統合先が既に別ユーザーへ割当済みの競合)とは
-- 別の問題(統合元が未同期)を扱うテーブルであり、混同しないよう別テーブルとする。
create table unresolved_common_user_merges (
  id uuid primary key default gen_random_uuid(),
  source_common_user_id text not null,
  target_common_user_id text not null,
  payload jsonb not null,
  reason text not null check (reason in ('source_user_not_found')),
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  attempt_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (source_common_user_id, target_common_user_id)
);

alter table unresolved_common_user_merges enable row level security;
