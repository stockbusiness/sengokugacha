# 千ノ国パスポート Phase C-0 PR4 セキュリティ検出事項

Phase C-0 PR4 §12(RLS・RPC実行権限テスト追加)で発見し、同PR内で修正した重大な権限設定の不備について記録する。指示書§2.1「テストを先に追加し、テストで見つかったバグは別コミットで直す」の方針に従い、テスト追加コミット(`9c41260`)と修正コミット(`801d112`)を分離している。

## 概要

`public`スキーマ配下のカスタム関数(28個全て)が、作成時のPostgreSQLのデフォルト権限により、`anon`ロール(Supabaseの公開APIキーに対応する、認証不要の匿名ロール)から`.rpc()`経由で直接実行可能な状態だった。

これらの関数にはテーブルのRLS(Row Level Security)を前提に「サーバー側からしか呼ばれない」という想定で書かれた、残高やentitlementを直接書き換える関数が含まれていた。RLSはテーブルへの直接のSELECT/INSERT/UPDATE/DELETEを制御するが、SECURITY DEFINERでない関数であっても、関数自体のEXECUTE権限が別途PUBLICに開いていれば、その関数を経由してテーブルを操作でき、RLSによる保護を実質的に迂回できてしまう。

## 影響範囲

`kokudaka`/`gacha_tickets`を直接加減算する`adjust_user_balance()`・`consume_gacha_ticket()`、entitlement付与/取消を確定させる`process_entitlement_grant()`/`process_entitlement_revocation()`、購入残高付与の`apply_purchase_balance_grant()`、agent_sales記録の`record_purchase_agent_sale()`、integration inboxのclaim処理`claim_integration_inbox_event()`など、`public`スキーマの全28関数が対象だった。

理論上、このアプリが発行する公開の`anon`キー(クライアント向けに配布される想定のキー)さえ知っていれば、第三者が`adjust_user_balance(<任意のuser_id>, 'kokudaka', 999999999)`のような呼び出しを直接実行し、任意ユーザーの残高を書き換えられる状態だった。

## 発見の経緯

Phase C-0 PR4 §12「RPC実行権限テスト」の実装にあたり、既存のマイグレーション(`supabase/migrations/*.sql`)を`grep`で調査したところ、`revoke execute`/`grant execute`を含む記述が一件も無いことに気づいた。PostgreSQLは関数作成時にデフォルトで`PUBLIC`(`anon`/`authenticated`を含む)へEXECUTE権限を付与するため、これは「明示的に許可した」のではなく「一度も剥奪していない」状態だと判断し、開発用サンドボックスに一時的なPostgreSQLクラスタを起動して実地検証した。

```sql
select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
where n.nspname = 'public' and p.proname in (
  'process_entitlement_grant', 'process_entitlement_revocation',
  'adjust_user_balance', 'consume_gacha_ticket',
  'claim_integration_inbox_event', 'claim_integration_outbox_event',
  'apply_purchase_balance_grant'
);
```

この結果、対象7関数全てで`anon`/`authenticated`が`true`(実行可能)であることを確認した。さらに`SET ROLE anon;`の上で実際に`adjust_user_balance(...)`を呼び出し、権限エラーではなく関数本体が実行される(=攻撃が成立する)ことを確認した。

## 修正内容

`supabase/migrations/20260809000009_revoke_public_execute_on_functions.sql`で以下を実行した。

```sql
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;
```

`20260809000001_grant_service_role_privileges.sql`で`service_role`へのGRANTは既に行われていたため、今回追加したのは「PUBLICからのREVOKE」のみである。`default privileges`も合わせて変更したことで、今後追加される関数にも同じ方針が自動的に適用される。

## 修正の安全性確認

- 修正適用後、`anon`/`authenticated`は対象の全関数で`has_function_privilege = false`になり、`SET ROLE anon; SELECT adjust_user_balance(...)`が`ERROR: permission denied for function adjust_user_balance`で拒否されることを確認した。
- `service_role`は引き続き`has_function_privilege = true`であり、`SET ROLE service_role`での同じ呼び出しは業務エラー(存在しないユーザーIDに対する`user not found`)にはなるが、権限エラーにはならないことを確認した。
- ソースコード全体(`src/`)を検索し、クライアント側(ブラウザ)からSupabaseへ接続するコード・`.rpc()`を呼ぶコードが一件も無い(全ての`.rpc()`呼び出しがサーバー側`service_role`キー経由)ことを確認した。このため、今回の修正によって正規の機能が壊れることはない。
- CI(GitHub Actions)の`integration-test`ジョブ(実際のSupabase local + PostgREST環境)で、修正後も§3〜§12の全統合テストがグリーンであることを確認した(`tests/integration/rls-policies.test.ts`の新規RPCテストを含む)。

## 対応状況

- **1. ソースコード上で実装済み** かつ **3. DB統合テスト確認済み**(開発用サンドボックスでの実地確認、CIの`integration-test`での実地確認の両方)。
- 本番環境への適用・確認は未実施(**7. 未対応**、`docs/IMPLEMENTATION_STATUS_PHASE_C0_PR4.md`参照)。本番Supabaseプロジェクトに対しても同じ`has_function_privilege`チェックで現状を確認し、本マイグレーション適用後に同様の検証を行うことを推奨する。
