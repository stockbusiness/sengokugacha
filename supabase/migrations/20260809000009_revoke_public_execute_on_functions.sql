-- 千ノ国パスポート Phase C-0 PR4(§12 RLS追加試験)。
--
-- 20260809000001_grant_service_role_privileges.sqlはservice_roleへEXECUTEを
-- 付与したが、PostgreSQLは関数作成時にデフォルトでPUBLIC(anon/authenticated含む)
-- へもEXECUTEを許可しているため、そちらをrevokeしていなかった。この結果、
-- kokudaka/gacha_tickets等を直接書き換えるadjust_user_balance()や、entitlement・
-- integration inbox・purchase_grant_stepsを操作するclaim/process系の全関数が、
-- テーブルのRLS(ポリシー未設定=デフォルト拒否)を完全に迂回してanon/authenticated
-- から実行可能な状態だった(§12のRPC実行権限テストで検出)。
--
-- public schema配下の全関数からPUBLICのEXECUTEを剥奪し、service_roleにのみ許可する。
-- 今後追加される関数にも同じ方針を適用するため、default privilegesも合わせて変更する。
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;
