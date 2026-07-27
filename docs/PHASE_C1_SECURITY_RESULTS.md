# 千ノ国パスポート Phase C-1 セキュリティ試験結果報告(§9のHMAC改ざん系・§12)

区分: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / 5.未対応 / 6.問題あり

## §12 RPC権限

確認内容と結果(区分2、local/CIの使い捨てPostgreSQL・Supabase localで実施):

| 確認項目 | 結果 |
|---|---|
| anon: EXECUTE不可 | `public`スキーマの全カスタム関数について`has_function_privilege('anon', ..., 'EXECUTE')`が`false`であることを確認(`tests/integration/rls-policies.test.ts`) |
| authenticated: EXECUTE不可 | 同上、`authenticated`ロールでも`false` |
| service_role: EXECUTE可 | `service_role`では`true`(業務エラーは出ても権限エラーにはならないことも確認、`docs/TEST_RESULTS_PHASE_C0_PR4.md`参照) |
| 新規テスト関数への自動権限剥奪 | `20260810000002_event_trigger_locks_down_new_functions.sql`のevent trigger(`lock_down_new_public_functions`)により、`public`スキーマへの`CREATE FUNCTION`完了時に自動でPUBLICからEXECUTEを剥奪・service_roleへ付与することを確認済み。`tests/integration/rls-policies.test.ts`が実際に使い捨て関数を作成→権限確認→DROPする一連の流れを自動化している |

**発見された重大な問題とその修正(既に対応済み)**: Phase C-0 PR4で、`public`スキーマの全28関数がPostgreSQLのデフォルト権限により`anon`から直接実行可能だったことを発見・修正した(`docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`)。さらにPR #147の修正過程で、「`alter default privileges`だけでは今後追加される新規関数へのPUBLIC自動付与を防げない」というPostgreSQLの仕様上の限界を発見し、event triggerによる自動ロックダウンに置き換えた(同文書に追記済み)。

**本セッションでの直接確認**: `scripts/production-migration-preflight.sql`(本Phase C-1 §4で拡張)のRPC実行権限チェックを、開発用サンドボックスの一時PostgreSQL 16クラスタ(全マイグレーション適用済み)に対して実行し、`anon`/`authenticated`が実行可能な関数が0件であることを直接確認した。

**ステージングでの実施(区分3、完了)**: `stockbusiness`が現行のSupabase環境(プロジェクト`vutnjxswfamluicsxwwi`)に対し、`scripts/production-migration-preflight.sql`相当のRPC実行権限チェックを実行した。

**重大な追加発見**: `20260809000009`・`20260810000002`(PUBLICからのEXECUTE剥奪+event trigger)を適用した直後の1回目のチェックで、`adjust_user_balance`・`execute_gacha_draw`・`process_entitlement_grant`等27関数が依然として`anon`/`authenticated`から実行可能であることが判明した。原因はSupabaseプロジェクト自体が`public`スキーマに対し`alter default privileges ... grant all on functions to anon, authenticated, service_role`という独自のブートストラップ権限を持っており、これは`PUBLIC`ロールとは別に`anon`/`authenticated`を名指しした独立したACLエントリのため、「PUBLICから剥奪」では一切剥奪できないことによる。ローカル検証(Phase C-0・本Phase C-1双方)はこのSupabase固有のブートストラップを持たない素のPostgreSQL 16コンテナで実施していたため、これまで見逃されていた(詳細: `docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`の追加検出事項)。

新規migration `20260810000003_revoke_anon_authenticated_function_execute.sql`(`anon`/`authenticated`を名指しで剥奪、event trigger本体も同様に修正)を作成・ステージングDBへ適用し、再度チェックを実行した結果、該当関数が0件になったことを確認した。

| 確認項目 | 結果 |
|---|---|
| anon: EXECUTE不可(修正前) | **NG**。27関数が実行可能(anon/authenticated双方) |
| anon: EXECUTE不可(`20260810000003`適用後) | OK。0関数 |
| authenticated: EXECUTE不可(`20260810000003`適用後) | OK。0関数 |
| event trigger有効性 | `select evtenabled from pg_event_trigger where evtname = 'lock_down_new_public_functions'` → `'O'`(有効)を確認 |

**未着手(区分5)**: 実際のステージング用`anon`/`authenticated`キー(Supabaseダッシュボードから取得)を使い、`supabase-js`クライアント経由で重要RPCを呼び出し、`permission denied for function`エラーになることを外形的に確認する手順(`docs/PHASE_C1_STAGING_TEST_PLAN.md`参照)。

## §9(セキュリティ観点): HMAC改ざん系の拒否

`tests/contracts/sen-no-kuni-hub-hmac.test.ts`で以下の改ざんパターンがいずれも401/409等で拒否されることを実HTTPリクエストで確認済み(区分2):

- key ID改ざん(存在しない/他システムのkey_id) → 401
- nonce改ざん(署名対象のnonceと実際に送信したnonceの不一致、またはnonce再利用) → 401 / 409
- Idempotency-Key改ざん(署名対象と実ヘッダーの不一致) → 401
- event version改ざん → 401
- raw body改ざん(署名計算後にbodyを書き換え) → 401(署名検証はraw bodyに対して行うため、JSON再シリアライズによる改ざんも検出できることを確認済み)

ステージングでの実施(未着手、区分3)は、同一テストスイートを現行環境URL・現行のHMAC鍵に向けて`stockbusiness`が再実行することで達成する(`docs/PHASE_C1_STAGING_TEST_PLAN.md`1.9参照)。
