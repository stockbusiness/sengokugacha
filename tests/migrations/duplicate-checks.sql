-- 千ノ国パスポート Phase C-0(§5.2 既存データ相当DBへのマイグレーション安全性確認)。
-- unique制約を追加する前に、対象カラムの組み合わせで重複行が無いことを確認する。
-- 重複が見つかった場合は、このスクリプトが自動で削除・統合することは絶対に行わない
-- (指示書§5.2「unique制約追加前に重複がある場合は、勝手に削除しないこと」)。
-- 重複が1件でも見つかった場合は、件数・原因・正とする行の決定方法・統合方針・
-- ロールバック方法・既存機能への影響をdocs/MIGRATION_PREFLIGHT_RESULTS.mdへ報告すること。

\echo '--- achievements: (user_id, achievement_type) 重複チェック ---'
select user_id, achievement_type, count(*)
from achievements
group by user_id, achievement_type
having count(*) > 1;

\echo '--- purchase_grant_steps: (purchase_id, step_key) 重複チェック ---'
select purchase_id, step_key, count(*)
from purchase_grant_steps
group by purchase_id, step_key
having count(*) > 1;

\echo '--- entitlements: (source_system_key, entitlement_id) 重複チェック ---'
select source_system_key, entitlement_id, count(*)
from entitlements
group by source_system_key, entitlement_id
having count(*) > 1;

\echo '--- integration_inbox_events: (source_system_key, event_id) 重複チェック ---'
select source_system_key, event_id, count(*)
from integration_inbox_events
group by source_system_key, event_id
having count(*) > 1;

\echo '--- stripe_webhook_events: stripe_event_id 重複チェック ---'
select stripe_event_id, count(*)
from stripe_webhook_events
group by stripe_event_id
having count(*) > 1;

\echo '--- duplicate-checks.sql: 完了(上記のいずれかに行が出力された場合は重複あり) ---'
