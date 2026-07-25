# Phase C-0 CI Pipeline(§16対応)

千ノ国パスポートDB統合テスト・マイグレーション安全化・CI必須化指示書 §16の対応状況を記録する。

## ジョブ構成

`.github/workflows/ci.yml`を単一の`verify`ジョブから、以下8ジョブへ分割した(`push: main` / `pull_request`双方でトリガー)。

| ジョブ名 | 内容 | Supabase local要否 |
|---|---|---|
| `typecheck` | `npx tsc --noEmit` | 不要 |
| `lint` | `npm run lint` | 不要 |
| `unit-test` | `npm run test:unit`(vitest、フェイクRepository含む) | 不要 |
| `architecture-test` | `npm run test:architecture`(domain/application層の依存関係ルール) | 不要 |
| `build` | `npm run build` | 不要 |
| `migration-test` | `supabase start`→`npm run test:migrations`(§5: 空DB適用+重複チェックSQL) | 要 |
| `integration-test` | `supabase start`→`npm run test:integration`(§6-9, §11, §15: 並行実行・RLS) | 要 |
| `contract-test` | `supabase start`→`npm run test:contracts`(§14: API Contract) | 要(一部) |

`migration-test`/`integration-test`/`contract-test`は`supabase/setup-cli@v1`で導入したSupabase CLIで`supabase start`を実行し、`supabase status -o env --override-name ...`で`SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY`/`SUPABASE_TEST_SERVICE_ROLE_KEY`/`DATABASE_TEST_URL`をジョブの環境変数へ書き出す。本番用のSupabase環境変数(`NEXT_PUBLIC_SUPABASE_URL`等)とは名前空間を分離しており、テストジョブが本番Supabaseへ接続することはない。

## このセッションでの確認状況

開発用サンドボックス環境ではDockerレジストリ(`production.cloudfront.docker.com`)へのアクセスが組織のegressポリシーで制限されており、`supabase start`(Postgres/GoTrue/PostgREST/Kong等、約10イメージのpull を要する)を実行できなかった。そのため、以下の区分で状況を報告する。

- `typecheck`/`lint`/`unit-test`/`architecture-test`/`build`: **2. unit test確認済み**(このセッションで実際にローカル実行し成功を確認)。
- `contract-test`のうちDBに依存しない認証ゲート(unauthorized/権限不足/HMACヘッダー欠落)部分: このセッションで実際に`next dev`を子プロセスとして起動し、`npm run test:contracts`をSupabase local無しで実行して成功を確認した(8/9件成功、DB依存の1件はskip)。**2. unit test確認済み**に準ずる形でHTTPレベルの実地確認ができている。
- `migration-test`/`integration-test`/`contract-test`のDB依存部分、およびGitHub Actions上での`supabase/setup-cli@v1`→`supabase start`自体の動作: **7. 未確認**。GitHub-hosted runner(ubuntu-latest)はDockerレジストリへの制限が無いため動作する想定だが、このセッションでは実際にGitHub Actions上での実行結果を確認できていない。本PRのCI実行結果(GitHub上)で初めて実地確認されることになる。

## branch protection(必須チェック化)について

指示書§16「すべて成功しない限りmerge不可」を満たすには、リポジトリのbranch protection設定(Settings → Branches → Branch protection rules → `main`)で、Required status checksに新しい8ジョブ名(`typecheck`, `lint`, `unit-test`, `architecture-test`, `build`, `migration-test`, `integration-test`, `contract-test`)を追加する必要がある。

**重要**: 従来は単一ジョブ名`verify`がrequired status checkとして設定されていた可能性がある。ジョブ名が変わった(`verify`→8ジョブ)ため、既存のbranch protection設定が`verify`を必須としたままだと、新しいジョブ構成のCIが全て成功してもマージ許可の判定に反映されない(または逆に、`verify`ジョブが存在しなくなったことでrequired checkが永久に「pending」のままになりマージがブロックされ続ける)おそれがある。

この設定変更はGitHubリポジトリの管理者権限操作であり、このセッションのGitHub連携ツールでは変更できない(またはリスクが大きいため意図的に行っていない)。**本部管理者がGitHubリポジトリのBranch protection設定を上記8ジョブ名で更新する必要がある。**

## 未対応・今後の課題

- RLSテスト(§15)は`tests/integration/rls-policies.test.ts`としてintegration-testジョブに含めている(§15専用の別ジョブは設けていない)。
- テスト終了後のSupabase local環境のクリーンアップは各ジョブの`supabase stop`ステップ(`if: always()`)で行う。
