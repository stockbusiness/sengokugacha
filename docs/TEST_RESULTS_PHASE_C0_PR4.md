# 千ノ国パスポート Phase C-0 PR4 テスト結果

PR #147に対する実際の検証結果をまとめる。

## ローカル検証(このセッションで実行、開発用サンドボックス)

- 全コミットで`npx tsc --noEmit`・`npm run lint`(対象ファイル)を実行し、エラー0件を確認。
- `npx vitest run`(unit test全体、`src/modules`・`src/lib`配下)を複数回実行し、リグレッション無し(最終確認時点で26ファイル・238件成功)。
- §11・§12の検証のため、開発用サンドボックスに一時的にPostgreSQL 16クラスタ(`service postgresql start`)を起動し、`supabase/migrations/`配下の全72〜73マイグレーションを空DBへ順に適用(`storage.buckets`/`storage.objects`テーブル、`anon`/`authenticated`/`service_role`ロールをSupabase local相当にスタブ作成した上で実施)。
  - §11: `tests/migrations/fixtures/pre_phase_c0.sql`投入→`tests/migrations/duplicate-checks.sql`実行→0件を確認。さらに`achievements`のunique制約を一時的に外して意図的な重複行を挿入し、同じクエリが実際に検出できる(1件ヒット)ことを確認した上でROLLBACKして後始末(詳細: `docs/MIGRATION_PREFLIGHT_RESULTS.md`)。
  - §12: 修正前は`adjust_user_balance`等7関数全てで`anon`/`authenticated`に対する`has_function_privilege(...)`が`true`(実行可能)であることを確認。`20260809000009`適用後は全てfalseになり、`SET ROLE anon; SELECT adjust_user_balance(...)`が`ERROR: permission denied for function adjust_user_balance`で拒否されること、`service_role`は同じ呼び出しで業務エラー(`user not found`)にはなるが権限エラーにはならないことを確認(詳細: `docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`)。検証後、一時DBは`DROP DATABASE`で削除しクラスタは停止した。
- クライアント側(ブラウザ)からのSupabase接続・`.rpc()`呼び出しがソースコード全体に存在しないこと(`grep`で確認、`createClient`/`createBrowserClient`の使用箇所が`src/lib/supabase-server.ts`系のみ)を確認し、§12の修正が既存機能に影響しないことを裏付けた。

## GitHub Actions実行結果(実環境、PR #147)

開発用サンドボックスでは`supabase start`(Docker)自体が実行できないため、DBに依存する部分の最終確認はGitHub Actions上の実行に委ねた。§3〜§13の各コミットをpushするたびに、以下8ジョブの結果を`mcp__github__pull_request_read`(`get_check_runs`)で確認した。

| ジョブ名 | §3(`59919fc`) | §7(`831b58e`) | §8(`4315321`) | §9(`3f87c59`) | §10(`b92744e`) | §11(`495ac51`) | §12(`801d112`+`db65412`) |
|---|---|---|---|---|---|---|---|
| `typecheck` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `lint` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `unit-test` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `architecture-test` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `build` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `migration-test` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅(§11フィクスチャ含む) | ✅ |
| `integration-test` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅(§12 RLS/RPCテスト含む) |
| `contract-test` | ✅ | ✅ | ✅ | ✅(§9 HMACテスト含む) | ✅(§10テスト含む) | ✅ | ✅ |

(表中の§番号は主にその区分のテストを追加・修正したコミットを指すが、各CI実行はその時点までの全テストを実行するため、実際には全区分のテストが毎回実行されている。§4/§5/§6も同様の手順で個別に緑を確認済み。)

## §12で実際に検出されたバグ(重要)

CIの`integration-test`ジョブで、`9c41260`(テスト追加のみ)push後に予想通り失敗することを確認する代わりに、ローカルのPostgreSQLクラスタで先に再現・修正を完了させてから`801d112`(fix)を続けてpushした(§2.1「テストで見つかったバグは別コミットで直す」を満たしつつ、CIサイクルを浪費しない判断)。`801d112`+`db65412`のpush後、`integration-test`ジョブが実際にグリーンになったことを確認済み(詳細: `docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`)。
