-- 千ノ国パスポート 全体統合対応 実装計画(PR4)。
-- 「現在の担当代理店」(共通実装契約の assigned_agency_id に対応)。既存の
-- users.referring_agent_id(初回登録時の紹介代理店、ファーストタッチ・変更不可)とは
-- 別概念であり、運用上変更可能なため別カラムとして持つ。既定値はnullで、
-- 既存ユーザー・既存ロジックへの影響は無い。
alter table users add column assigned_agent_id uuid references agents(id);
