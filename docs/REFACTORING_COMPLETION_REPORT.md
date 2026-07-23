# 千ノ国パスポート モジュール化・保守性改善 完了報告書

`SEN_NO_KUNI_PASSPORT_MODULARIZATION_INSTRUCTIONS.md`が要求する最終成果物。Phase 0〜6(PR1〜PR14)の実施内容・検証結果・未対応事項をまとめる。

## サマリ

指示書が要求した「モジュラーモノリスへの段階的移行」のうち、**domain層(DB非依存の純粋関数)の抽出とそのCI強制**を完了した。指示書が明示的に禁止する「フルリライト・ビッグバン移行」「外部仕様変更と内部リファクタリングの同居」は一貫して回避し、全14PRを通じて既存の外部API・DB挙動・Cookie仕様には一切変更を加えていない。

application層・infrastructure層(DB/外部API呼び出しを伴う処理)の本格的な分離は、本リポジトリにDB統合テスト基盤が無いというPhase 0時点で確認済みの制約により、今回のスコープからは意図的に除外した(詳細は「未対応事項」参照)。

## 実施内容(Phase・PR別)

| Phase | PR | 内容 | 状態 |
|---|---|---|---|
| Phase 0 | (計画) | 既存挙動のベースライン方針決定(純粋関数のみ自動テスト化) | 完了 |
| Phase 1 | PR1 | `src/shared/`新設(database/time/observability/http/errors) | 完了 |
| Phase 2 | PR2 | ガチャ・国取りのベースラインテスト(既存関数へのexport付与+テスト作成) | 完了 |
| Phase 2 | PR3 | gachaモジュール抽出(domain層) | 完了 |
| Phase 2 | PR4 | conquestモジュール抽出(domain層) | 完了 |
| Phase 3 | PR5 | 代理店・共通IDのベースラインテスト | 完了 |
| Phase 3 | PR6 | agencyモジュール抽出(domain層) | 完了 |
| Phase 3 | PR7 | passport read model分離(domain層) | 完了 |
| Phase 4 | PR8 | commerce/entitlementsのベースラインテスト棚卸し(ドキュメントのみ) | 完了 |
| Phase 4 | PR9 | commerceモジュール抽出(domain層) | 完了 |
| Phase 4 | PR10 | castleモジュール抽出(domain層) | 完了 |
| Phase 5 | PR11 | integrationsモジュール抽出(HMAC連携のevent envelope検証) | 完了 |
| Phase 5 | PR12 | Stripe Webhookのinbox冪等判定を抽出 | 完了 |
| Phase 6 | PR13 | セッション基盤統一(`shared/auth`抽出) | 完了 |
| §14 | PR14 | gacha domain残存依存解消+アーキテクチャ依存関係CIテスト追加 | 完了 |
| §12 | (本書) | 最終成果物4文書の作成 | 完了 |

## 一貫して採用した設計判断

1. **domain-only抽出**: 各PRで、既に副作用のない(DB呼び出しを含まない)関数・型・エラークラスのみを`src/modules/*/domain/`へ移設した。DB呼び出しを伴う処理(`drawFreeGacha`/`upsertAgentFromSync`/`runPurchaseGrant`/`transitionContract`等)は元の`src/lib/*.ts`にそのまま残した。
2. **import+re-export**: 移設元の`src/lib/*.ts`は、移設先のdomainモジュールを`import`して`export`で再エクスポートする。これにより、既存の外部import経路(`@/lib/*`)を一切変更せずに済み、ダウンストリームの消費者(APIルート・他のlibファイル・UIコンポーネント)を更新する必要が無かった。
3. **移動前後でのテスト数の一致確認**: 各PRで`npx vitest run`のテスト総数が移動前後で完全に一致することを確認し、ロジックの欠落・重複が無いことを検証した(新規テストを追加したPRを除く)。
4. **mechanical diffのレビュー**: PRごとに`get_files`でdiffを取得し、意図した機械的な移動以外の変更が含まれていないことを確認してからマージした。

## 検証結果の推移

| 時点 | `npx vitest run` | 備考 |
|---|---|---|
| Phase 0開始前 | 84 tests | ベースライン |
| PR2完了後 | 101 tests | ガチャ・国取りの新規テスト+17 |
| PR3/PR4完了後 | 101 tests | 移動のみ、増減なし |
| PR5完了後 | 111 tests | 代理店・共通IDの新規テスト+10 |
| PR6/PR7完了後 | 111 tests | 移動のみ、増減なし |
| PR8完了後 | 111 tests | ドキュメントのみ、コード変更なし |
| PR9/PR10完了後 | 111 tests | 移動のみ、増減なし |
| PR11完了後 | 121 tests | event envelope検証の新規テスト+10 |
| PR12完了後 | 126 tests | Stripe inbox冪等判定の新規テスト+5 |
| PR13完了後 | 132 tests | セッションJWT署名・検証の新規テスト+6 |
| PR14完了後 | 150 tests | アーキテクチャ依存関係テストの新規+18(移動のみのファイルは増減なし) |

全PRを通じて`rm -rf .next && npx tsc --noEmit`・`npm run lint`(既存の`<img>`警告2件のみ、無関係)・`npm run build`が全て成功することを確認済み。

## 未対応事項(指示書のスコープに対する差分)

1. **application層・infrastructure層の分離**: `src/lib/*.ts`に残るDB呼び出し・外部API呼び出しロジック(`upsertAgentFromSync`/`runPurchaseGrant`/`transitionContract`/`transitionExternalOrder`/`grantExternalOrderRights`等)は、`src/modules/*/application/`・`src/modules/*/infrastructure/`への本格移行が指示書の目指す最終形だが、本リポジトリにDBモック・統合テスト基盤が無いため、移動に伴うリグレッションリスクを許容できず今回は見送った。移行する場合は、まずDBモック基盤(例: Supabase local実行環境でのテスト、またはリポジトリパターン導入+フェイク実装)の整備から着手することを推奨する。
2. **identity/entitlements/walletモジュールのdomain層**: `docs/MODULE_BOUNDARIES.md`に記載の通り、これら3モジュールはdomain層に切り出せる純粋関数が(セッションJWT署名・検証を除き)存在しないか、そもそも指示書のスコープ外(wallet)であるため、domain層を作成していない。
3. **APIルートの薄型化(Phase 5)**: `/api/integrations/sen-no-kuni-hub`・`/api/stripe/webhook`は事前条件チェック(event envelope検証・inbox冪等判定)のみをdomain層へ抽出し、ディスパッチ本体(DB呼び出し部分)は元のルートファイルに残した。ルートファイル自体をさらに薄くする(コントローラー+アプリケーションサービスへの分離)動きは今回のスコープに含めていない。
4. **依存関係ルールの推移的検証**: `docs/DEPENDENCY_RULES.md`に記載の通り、`src/modules/architecture-rules.test.ts`は直接importのみを検証し、推移的な依存関係(import先がさらに何をimportしているか)は解決しない。ts-morphによるimportグラフ構築やdependency-cruiser等の専用ツール導入は今回のスコープに含めていない。
5. **§14が求めるCI組み込み**: `architecture-rules.test.ts`は通常の`vitest`テストスイートの一部として実行されるため、既存のCI(GitHub Actions、`npm test`相当のジョブ)に組み込み済みである(既存のvitest実行ステップに新規テストファイルとして自動的に含まれる)。ただし、CI設定ファイル自体(`.github/workflows/*.yml`)への明示的な追記・専用ジョブの新設は行っていない。

## ロールバック

各PRはGitHub上でsquashマージされた個別のコミットとして`main`に記録されているため、問題が発覚した場合は該当PRのコミットを`git revert`することで個別に切り戻し可能である。全てのPRが「import+re-export」パターンを採用しているため、切り戻しは対応する`src/lib/*.ts`・APIルートファイルの1コミット差分のみで完結し、他のモジュールへの影響は無い。
