# PR #147 マージ前最終修正指示 §8: 報告書マッピング表

「千ノ国パスポートパスポート PR #147 マージ前最終修正指示」§8は、以下6文書の新規作成、または既存の同等文書へのマッピング表の提出を求めている。本PRには既にPhase C-0 PR4指示書対応で作成した7文書(`docs/*_PHASE_C0_PR4.md`等)があり、要求された6文書の内容はいずれもそれらでカバー済みのため、新規文書は作成せず本マッピング表を提出する。

| §8で要求された文書 | 対応する既存文書 | 備考 |
|---|---|---|
| `docs/DB_INTEGRATION_TEST_PLAN.md` | `docs/IMPLEMENTATION_STATUS_PHASE_C0_PR4.md`(「前提: 今回の検証方針」章)+ 各`tests/integration/*.test.ts`のファイル先頭コメント | 検証方針(Supabase local vs 開発用サンドボックスの使い分け、§3〜§13ごとの対象RPC・観点)は`IMPLEMENTATION_STATUS_PHASE_C0_PR4.md`に、個々のテストの目的・対象関数はテストファイル自体のコメントに記載する既存方針を踏襲している(独立した「計画書」を別途持たない代わりに、テストコードとその変更履歴が計画の実体になっている)。 |
| `docs/DB_INTEGRATION_TEST_RESULTS.md` | `docs/TEST_RESULTS_PHASE_C0_PR4.md` | ローカル検証(開発用サンドボックスでの一時PostgreSQLクラスタでの実地確認)・GitHub Actions実行結果(実環境)の両方を記載。 |
| `docs/CONCURRENCY_TEST_RESULTS.md` | `docs/TEST_RESULTS_PHASE_C0_PR4.md`(§3〜§9の10/20並列試験の記述)+ `docs/MIGRATION_PREFLIGHT_RESULTS.md`(unique制約による重複防止の裏付け) | 並行実行試験(purchase_grant_steps 10並列・entitlements 10並列・gacha 10/20並列・inbox/outbox並列claim等)の結果は`TEST_RESULTS_PHASE_C0_PR4.md`に統合済み。個別の並列テストファイルは`tests/integration/*-concurrency.test.ts`。 |
| `docs/API_CONTRACT_TEST_RESULTS.md` | `docs/IMPLEMENTATION_STATUS_PHASE_C0_PR4.md`(§9・§10行、「4. 実環境接続確認済み」区分) | `tests/contracts/sen-no-kuni-hub-hmac.test.ts`(HMAC v1/v2実接続)・`tests/contracts/admin-recovery-endpoints.test.ts`(entitlements/retry-resolve等の正常系)・`tests/contracts/stripe-webhook-purchase-flow.test.ts`(Stripe実署名検証)の結果を記載。 |
| `docs/RLS_TEST_RESULTS.md` | `docs/SECURITY_FINDINGS_PHASE_C0_PR4.md` + `docs/TEST_RESULTS_PHASE_C0_PR4.md`(§12章) | RLS/RPC実行権限テスト(anon/authenticated/service_roleの`has_function_privilege`確認)の結果と、そこで発見した重大な権限バグ(全28関数がPUBLIC実行可能だった件)の詳細・修正内容を記載。マージ前最終修正指示§6で追加発見した「default privilegesは新規関数へのPUBLIC自動付与を防げない」問題も同文書に追記済み。 |
| `docs/PHASE_C0_COMPLETION_REPORT.md` | `docs/ACCEPTANCE_CHECKLIST_PHASE_C0_PR4.md`(§2.1作業原則の遵守状況・§3〜§13の受入条件充足状況の最終チェックリスト) + `docs/IMPLEMENTATION_HISTORY_PHASE_C0_PR4.md`(コミット単位の実装履歴) | 完了報告として、達成状況のチェックリストと、それを裏付ける実装履歴(コミットハッシュ・種別・対応§・内容)の2文書に相当する。 |

## マージ前最終修正指示(§1〜§7)の対応状況

上記6文書はPhase C-0 PR4指示書(§3〜§14)向けの報告書であり、その後追加された「PR #147マージ前最終修正指示」(§1〜§11)自体の対応状況は、PR本文および以下のコミットで示す(指示書自体が新規の完了報告書作成を明示的に求めているのは§8の6文書のみで、§1〜§7自体に対する専用の報告書作成は求められていない)。

| § | 内容 | 状態 | 対応コミット |
|---|---|---|---|
| §1 | Entitlement順序逆転の自動収束 | 完了 | `2474861`(fix)、`0eeeb78`(test) |
| §2 | テスト専用DB関数を本番migrationから除去 | 完了 | `0eeeb78`に含む(`20260809000006`削除、`tests/integration/support/test-only-db-functions.ts`で動的作成/削除) |
| §3 | 実際のupgrade migration試験 | 完了 | `b27d25c` |
| §4 | Outbox送信冪等性(idempotency key) | 完了 | `f6652fc` |
| §5 | ガチャ残テスト(美濃国・天下統一・動画取得失敗フェイルセーフ) | 完了 | `e540665` |
| §6 | RPC権限修正の追加確認 | 完了 | `9130031`(test)、`bf691ba`(fix)。詳細は`docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`の追加検出事項 |
| §7 | branch protection設定(8ジョブ必須化+PR必須・up-to-date・会話解決・force-push禁止・削除禁止) | ドキュメント整備完了、実際の設定適用は未実施(下記参照) | `8f6e6f3`(`docs/CI_PIPELINE.md`更新) |
| §8 | PR本文・報告書更新 | 本コミット | (本ファイル) |
| §9 | 人によるレビュー | 未対応(下記参照) | - |
| §10/11 | 受入条件・ロールバック条件の最終確認 | 進行中 | - |

### §7についての重要な制約

branch protection・repository rulesetsの変更はGitHubリポジトリの管理者権限操作であり、このセッションで利用可能なGitHub連携ツール(`mcp__github__*`)を全て確認したが、該当するAPIエンドポイントに対応するツールは存在しない。**本部管理者が`docs/CI_PIPELINE.md`記載の設定(8ジョブのRequired status checks + PR必須・up-to-date必須・会話解決必須・force-push禁止・削除禁止の5項目)をGitHub UIから手動で適用する必要がある。**

### §9についての重要な制約

人間レビュアーのアサインも同様にリポジトリへのアクセス権限を持つ人間の判断・操作を要する。このセッションからはレビュアーを指定できないため、**本部管理者(またはPRオーナー)が、entitlement状態遷移・RPC権限・outbox再送・migration順序・SECURITY DEFINER/search_path・rollback・本番影響の各観点に詳しい開発者をレビュアーとしてアサインする必要がある。** PRがDraftのままである限りレビュー依頼はブロックされるため、レビュアーアサイン後にReady for reviewへ切り替えることを推奨する。
