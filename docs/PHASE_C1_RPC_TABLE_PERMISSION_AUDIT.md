# 千ノ国パスポート 全RPC・全テーブル権限監査結果(§5.4)

区分: 1.ソースコード確認済み / 2.local確認済み / **3.staging確認済み** / 4.production未確認 / 5.未対応 / 6.問題あり / 7.管理者操作待ち / 8.Stripeアカウント待ち

Stripe取得待ち期間対応指示書§5.4に基づき、2026-07-28にステージングDB(プロジェクト`vutnjxswfamluicsxwwi`)へ`stockbusiness`が実際にSQLを実行して確認した。RPC(関数)側の実行権限は§5.3の完全preflight(ブロック7)で既に確認済みのため、本ドキュメントでは全テーブルのRLS設定・権限を棚卸しする。

## RPC(関数)側

§5.3(`docs/MIGRATION_PREFLIGHT_RESULTS.md`実行結果4)で確認済み。`anon`/`authenticated`がEXECUTE権限を持つpublicスキーマの関数は0件(`20260810000003`のセキュリティ修正が有効に機能している)。

## テーブル側

### 確認1: 全publicテーブルのRLS有効化状況・ポリシー数

```sql
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 2 asc, 3 desc, 1;
```

**結果**: 全82テーブルで`rls_enabled = true`・`policy_count = 0`。例外は1件も無かった。

このアプリはSupabase Authを使わない(LINEログイン+独自セッションCookie)ため、`anon`/`authenticated`ロールで実際に発行されるJWTを使ったクライアント直接アクセス経路自体が存在しない設計であり、全テーブルへのアクセスをRLSポリシー未設定=デフォルト全拒否にすることで、`anon`/`authenticated`からの読み書きを一切許さない状態になっている(`tests/integration/rls-policies.test.ts`が同じ前提を検証している)。

### 確認2: anon/authenticatedのテーブル権限(GRANT)

```sql
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;
```

**結果**: `anon`・`authenticated`ともに、確認した全テーブルで`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`が付与されている。

**これは異常ではない**。Supabaseはプロジェクト作成時に、`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role`相当の権限をデフォルトで自動付与する仕様であり、実際のアクセス制御はテーブル権限(GRANT)ではなくRLS(ポリシー)側で行う設計(Supabase公式のセキュリティモデル)。確認1で「RLS有効・ポリシー0件」を確認済みのため、GRANTが存在していても`anon`/`authenticated`は実質的に1行も読み書きできない。

**関数(RPC)との違いに注意**: PostgreSQLの関数はRLSの対象外であり、EXECUTE権限が唯一の防御層のため、`20260810000003`で明示的なREVOKEが必須だった。一方テーブルはRLSが防御層として機能するため、テーブル側のGRANTを明示的にREVOKEする必要は無い(むしろSupabase標準の運用から外れる非標準構成になり、将来的な保守性を下げる)。

## 結論

- RPC・テーブルともに、`anon`/`authenticated`から千ノ国パスポートのデータへ到達する経路は存在しない。
- サーバー側(Next.js APIルート)がservice roleキー経由でのみDBへアクセスする設計が、DB側の権限設定とも整合していることを実地確認できた。
- 追加の是正措置は不要。
