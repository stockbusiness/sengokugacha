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

## 追加検出事項: default privilegesは新規関数へのPUBLIC自動付与を防げない(マージ前最終修正指示§6で発見)

`20260809000009`のコメントは「今後追加される関数にも同じ方針が自動的に適用される」と
記述していたが、これは`alter default privileges`の実際の挙動の誤解に基づく記述だった。

開発用サンドボックスに独立した複数のクリーンなPostgreSQL 16データベースを用意し、
`alter default privileges in schema public revoke execute on functions from public;`
`alter default privileges in schema public grant execute on functions to service_role;`
のみを実行した状態で新規に`create function`した結果、生成された関数の実際のACL
(`pg_proc.proacl`)には`revoke`したはずのPUBLICへのEXECUTEが依然として含まれており、
`has_function_privilege('anon', ...)`が`true`を返すことを複数回再現した。

一方、**既存の関数を`create or replace function`で再定義した場合は、PostgreSQLの仕様
によりACLがそのまま保持される**ため、`20260809000009`で一度EXECUTEを剥奪した関数
(`process_entitlement_grant`等)が、その後のマイグレーション(`20260810000001`)で
再定義されても、剥奪状態が失われないことも確認済み。影響を受けるのは「これまで一度も
存在しなかった、完全に新規の関数」が今後追加される場合のみである。

### 修正

`default privileges`に代えて、イベントトリガー(`20260810000002_event_trigger_locks_
down_new_functions.sql`)を導入した。`public`スキーマへの`CREATE FUNCTION`
(`CREATE OR REPLACE FUNCTION`を含む、コマンドタグはいずれも`'CREATE FUNCTION'`)完了時に
自動発火し、対象関数から明示的にPUBLICのEXECUTEを剥奪、service_roleへEXECUTEを付与する。
`auth`/`storage`/`extensions`等の他スキーマの関数(Supabase自身の内部機構が依存する
可能性がある)には影響しないよう、`schema_name = 'public'`の関数のみを対象にした。

開発用サンドボックスで、空DBから全マイグレーション(本追加分含む)を適用した状態で
新規関数を作成し、`anon`/`authenticated`が`false`、`service_role`が`true`になる
ことを実地確認した。トリガー自身のハンドラ関数(`_lock_down_new_public_functions`、
event trigger型のため直接呼び出し自体が拒否される)にも明示的なrevoke/grantを追加し、
`public`スキーマ内でanon/authenticatedが実行可能な関数が0件であることを確認済み。

## 追加検出事項: PUBLICからの剥奪はSupabase実環境のanon/authenticated個別付与には効かない(Phase C-1ステージング適用中に発見)

`20260809000009`・`20260810000002`はいずれも「`PUBLIC`ロールからEXECUTE剥奪」のみを
行っていた。ローカル検証(本ドキュメントの上記2件を含む)は、いずれもSupabase独自の
ブートストラップ権限設定を持たない素のPostgreSQL 16コンテナで実施しており、その環境では
「PUBLICから剥奪」だけで`has_function_privilege('anon', ...)`が`false`になることを
確認できていた。

しかし実際のSupabaseプロジェクトへこれらのマイグレーションを適用した結果、
`adjust_user_balance`・`execute_gacha_draw`・`process_entitlement_grant`等、
ほぼ全ての新規関数が`anon`/`authenticated`から引き続き実行可能なままであることが
判明した(§12のRPC実行権限チェックで検出)。

原因は、Supabaseプロジェクトが初期設定として`public`スキーマに対し

```sql
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
```

というSupabase自身のブートストラップ権限ルール(PostgRESTが素の関数呼び出しを行える
前提の既定設計)を持つことだった。これは`PUBLIC`ロールとは独立した、`anon`/`authenticated`
を名指ししたACLエントリであるため、`PUBLIC`からの剥奪は一切ここに効かない。素の
PostgreSQL 16コンテナにはこのSupabase固有のブートストラップが存在しないため、
これまでのローカル検証では再現されず見逃されていた。

### 修正

`20260810000003_revoke_anon_authenticated_function_execute.sql`で、`anon`/
`authenticated`を`PUBLIC`と併記して明示的に対象へ追加した。

```sql
revoke execute on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
alter default privileges in schema public grant execute on functions to service_role;
```

event trigger本体(`_lock_down_new_public_functions`)も同じ抜けを持っていたため、
`revoke execute on function %s from anon, authenticated, public`に修正した。

### 検証

実際のSupabaseステージングプロジェクトに対して、`20260810000003`適用前後で
§12のRPC実行権限チェック(`has_function_privilege('anon'/'authenticated', ..., 'EXECUTE')`
が`true`になる`public`スキーマの関数を列挙するクエリ)を実行し、適用前は27関数が
該当・適用後は0関数に減少したことを確認した(`docs/PHASE_C1_SECURITY_RESULTS.md`参照)。

## 追加検出事項: Outboxの外部送信がIdempotency-Keyを再送のたびに使い捨てていた(マージ前最終修正指示§4で発見)

`src/lib/common-user-hub.ts`の`postToAgencySystem()`(sengoku-ai.comへのHMAC以前の
既存連携、`referrals/confirm`等)は、`claim_integration_outbox_event`によるclaim
トークンでの二重送信防止(20260809000008、Phase C-0 PR4 §8.2)とは別に、送信のたびに
`Idempotency-Key`ヘッダーへ`randomUUID()`を新規生成して載せていた。

これにより、「外部送信(sengoku-ai.comへのPOST)自体は成功したが、その直後の
`markSent`(outbox行のstatus更新)より前にプロセスが落ちる」シナリオで、
`integration-outbox/drain`による再送が**毎回異なるIdempotency-Keyで同じ紹介確定
イベントを再送**していた。claimトークンは戦国パスポート側の「同じ行を2並列workerが
同時に処理しない」ことしか保証しておらず、送信自体が成功済みかどうかをsengoku-ai.com側
で判別する手段が無かったため、紹介確定・成果報酬が二重計上され得る状態だった
(claimトークンとIdempotency-Keyは別の関心事: 前者は自分側の二重実行防止、
後者は相手側の重複排除)。

### 対応

- `postToAgencySystem()`に`idempotencyKey`引数を追加し、呼び出し元が渡さない場合のみ
  `randomUUID()`にフォールバックする方式に変更した。
- `confirmReferral()`(referrals/confirm)の呼び出し元のうち、outbox経由で再送され得る
  2箇所(`src/modules/commerce/application/run-purchase-grant.ts`の購入確定時の初回送信、
  `src/app/api/admin/integration-outbox/drain/route.ts`の手動再送)は、いずれも
  `outbox:integration_outbox_events:<outbox event id>`という同一の安定キーを渡すように
  した。初回送信と再送(何度re-drainしても)で同じIdempotency-Keyになるため、
  sengoku-ai.com側の重複排除で二重処理を防げる。
- outbox経由でない直接呼び出し(`src/lib/passport.ts`の新規登録確定、`resolveCommonUserId`/
  `captureReferral`)についても、それぞれ`userId`・`referral_token`から導出した安定キーに
  変更した(ネットワーク層でのクライアント再試行によるcreate_if_missingの二重作成等を防ぐ)。
- LINE個別push通知(`src/lib/line-push.ts`の`pushMessage`、`notification_outbox_events`
  経由)はLINE Messaging APIにリトライキー機構が無く、残高・権利・報酬に一切影響しない
  通知専用の経路であるため、意図的に「at-least-once、重複時は同一文面がもう一度届き得る
  ベストエフォート」として現状のまま残すことにした(ユーザー承認済みの方針)。

### 検証

`src/lib/common-user-hub.test.ts`を新規作成し、以下を確認した。

- 呼び出し元が渡した`idempotencyKey`がそのまま`Idempotency-Key`ヘッダーに使われること。
- 同一outbox行に対して`confirmReferral()`を2回呼んだ場合(「送信成功後・DB更新前に
  プロセスが落ちて再送される」シナリオを模擬)、2回とも同じ`Idempotency-Key`になること。
- `idempotencyKey`を渡さない場合は呼び出しごとに異なるキーになること(後方互換の
  フォールバック動作の確認)。
- `resolveCommonUserId`/`captureReferral`が、それぞれ同一の`externalUserId`/
  `referral_token`に対して常に同じ`Idempotency-Key`を送ること。
