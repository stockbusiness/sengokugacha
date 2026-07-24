-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 §5.5後半
-- (未解決entitlementの管理画面: 一覧・再解決・却下・監査ログ)。
--
-- process_entitlement_grant()(マイグレーション20260808000003)は、common_user_idに
-- 対応するローカルユーザーがまだ同期されていない場合、application_statusをnot_appliedの
-- まま保持し、claim_outcome='user_unresolved'を返す。この状態のentitlementを一覧・
-- 手動再解決できるようにするのが本マイグレーションの目的。
--
-- 「却下」は、送信元のcommon_user_idが恒久的に誤っている等、再解決を試みても解消しない
-- ケースを運用側の判断で一覧から外すための操作(既存のunresolved_agent_assignments・
-- common_user_merge_conflictsと同じsoft-resolveパターン)。entitlements自体は削除せず、
-- application_status='not_applied'のまま残る(却下しても台帳としての記録は維持する)。
alter table entitlements
  add column resolution_dismissed_at timestamptz,
  add column resolution_dismissed_by text,
  add column resolution_dismissal_note text;
