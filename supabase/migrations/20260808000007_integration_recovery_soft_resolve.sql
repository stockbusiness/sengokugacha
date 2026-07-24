-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 §9(管理画面権限修正)。
-- common_user_merge_conflicts/unresolved_agent_assignmentsの手動解決・却下操作は、
-- これまで対象行を単純DELETEしており、過去の対応履歴が残らなかった。resolved_at/
-- resolved_by/resolution_noteを追加し、原則としてレコードを保持したまま「解決済み」
-- としてマークする方式に変更する。

alter table common_user_merge_conflicts
  add column resolved_at timestamptz,
  add column resolved_by text,
  add column resolution_note text;

alter table unresolved_agent_assignments
  add column resolved_at timestamptz,
  add column resolved_by text,
  add column resolution_note text;
