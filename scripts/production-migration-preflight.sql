-- 千ノ国パスポート Phase C-0 PR4(§11 既存データ相当マイグレーション試験)。
--
-- 本番相当DBへこのブランチのマイグレーションを適用する前に、手動で(読み取り専用の
-- DBロール等で)実行するための事前確認スクリプト。以下のunique制約の対象カラムの
-- 組み合わせで、適用前の実データに重複が無いことを確認する。
--   - achievements: (user_id, achievement_type)
--   - purchase_grant_steps: (purchase_id, step_key)
--   - entitlements: (source_system_key, entitlement_id)
--   - integration_inbox_events: (source_system_key, event_id)
--   - stripe_webhook_events: stripe_event_id
--
-- 【安全性】本スクリプトはSELECTのみで構成され、INSERT/UPDATE/DELETE/ALTER/DROPを
-- 一切含まない。tests/migrations/duplicate-checks.sqlと同じクエリを、本番DBへ手動で
-- 直接実行することを想定して独立したファイルにしたもの(supabase CLI・テスト実行環境
-- 一式を用意できない運用担当者でも、psqlだけで事前確認できるようにする)。
-- 重複が見つかった場合でも、このスクリプトが自動で削除・統合することは絶対に行わない
-- (指示書§5.2/§11と同じ方針)。重複が1件でも見つかった場合は、件数・原因・正とする行の
-- 決定方法・統合方針・ロールバック方法・既存機能への影響を報告してから対応すること。
--
-- 【前提】対象の5テーブルはいずれもこのPRより前の段階で作成済みであり、本番DBに
-- 既に存在している前提で書かれている(存在しない場合はrelation does not existで
-- 即座にエラー終了するため、その場合はまずテーブル作成マイグレーションの適用状況を
-- 確認すること)。
--
-- 【使い方】 psql "$PRODUCTION_DATABASE_URL" -f scripts/production-migration-preflight.sql

\echo '=== 千ノ国パスポート 本番マイグレーション事前確認(読み取り専用) ==='

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

\echo '=== 完了(上記のいずれかに行が出力された場合は重複あり。手動で調査・報告すること) ==='
