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
- `migration-test`/`integration-test`/`contract-test`のDB依存部分、およびGitHub Actions上での`supabase/setup-cli@v1`→`supabase start`自体の動作: **1. 実装済み・実地確認済み**(Phase C-0 PR4で更新)。開発サンドボックスからは確認できなかったが、PR #147への一連のプッシュ(§3〜§12対応、commit `831b58e`〜`801d112`)に対する実際のGitHub Actions実行で、8ジョブ全て(`typecheck`/`lint`/`unit-test`/`architecture-test`/`build`/`migration-test`/`integration-test`/`contract-test`)が繰り返しグリーンになることを確認した。`supabase/setup-cli@v1`→`supabase start`はGitHub-hosted runner上で問題なく動作し、`migration-test`ジョブでは§11で追加した既存データ相当フィクスチャ投入(`tests/migrations/run-preflight.sh`)も含めて成功している。開発用サンドボックスでのDocker制限は本番のCI実行には影響しない、という当初の想定が実地で裏付けられた。

## Phase C-0 PR4(§13)での追加対応

- §3〜§12で追加した統合テスト・Contractテスト・マイグレーション事前確認・RLS/RPC権限テストは、いずれも既存の8ジョブ構成(`migration-test`/`integration-test`/`contract-test`)にそのまま組み込まれ、ジョブ構成・トリガー条件(`push: main` / `pull_request`)の変更は不要だった。
- §12のRLS/RPC権限テストで、`public`スキーマの全カスタム関数がデフォルトで`anon`/`authenticated`からEXECUTE可能だったバグ(20260809000009で修正)を検出・修正した。修正後もCIの8ジョブは全てグリーンのままであることを確認済み。

## branch protection(必須チェック化)について

指示書§16「すべて成功しない限りmerge不可」を満たすには、リポジトリのbranch protection設定(Settings → Branches → Branch protection rules → `main`)で、Required status checksに新しい8ジョブ名(`typecheck`, `lint`, `unit-test`, `architecture-test`, `build`, `migration-test`, `integration-test`, `contract-test`)を追加する必要がある。

**重要**: 従来は単一ジョブ名`verify`がrequired status checkとして設定されていた可能性がある。ジョブ名が変わった(`verify`→8ジョブ)ため、既存のbranch protection設定が`verify`を必須としたままだと、新しいジョブ構成のCIが全て成功してもマージ許可の判定に反映されない(または逆に、`verify`ジョブが存在しなくなったことでrequired checkが永久に「pending」のままになりマージがブロックされ続ける)おそれがある。

この設定変更はGitHubリポジトリの管理者権限操作であり、このセッションのGitHub連携ツールでは変更できない(またはリスクが大きいため意図的に行っていない)。**本部管理者がGitHubリポジトリのBranch protection設定を上記8ジョブ名で更新する必要がある。**

### PR #147マージ前最終修正指示§7で追加要求された設定項目

上記の8ジョブ必須化に加えて、以下5項目もSettings → Branches → Branch protection rules → `main`で有効化する必要がある(いずれも本部管理者による手動操作。このセッションで利用可能なGitHub連携ツール一式を確認したが、branch protection/repository rulesetsを変更するAPIエンドポイントに対応するツールは存在せず、このセッションからは実行できない)。

| # | 設定項目 | GitHub UI上の該当チェックボックス |
|---|---|---|
| 1 | PRを経ないと`main`へマージできない | "Require a pull request before merging" |
| 2 | マージ前にPRのbranchが`main`の最新コミットに追従していること | "Require branches to be up to date before merging"("Require status checks to pass before merging" 配下のオプション) |
| 3 | 会話(レビューコメント)が全て解決済みであること | "Require conversation resolution before merging" |
| 4 | `main`へのforce-pushを禁止 | "Do not allow force pushes"(=Allow force pushesのチェックを外したままにする) |
| 5 | `main`ブランチの削除を禁止 | "Do not allow deletions"(=Allow deletionsのチェックを外したままにする) |

上記1〜5と、既存の8ジョブRequired status checks設定を合わせて初めて、指示書§10(受入条件)・§11(ロールバック条件)が定める「branch protectionが設定されていること」を満たす。本部管理者が上記を設定した後、GitHub UIの当該画面のスクリーンショット、または`gh api repos/stockbusiness/sengokugacha/branches/main/protection`の出力を本対応の完了証跡として残すことを推奨する。

## 未対応・今後の課題

- RLSテスト(§15)は`tests/integration/rls-policies.test.ts`としてintegration-testジョブに含めている(§15専用の別ジョブは設けていない)。
- テスト終了後のSupabase local環境のクリーンアップは各ジョブの`supabase stop`ステップ(`if: always()`)で行う。
