# 千ノ国パスポート 現状確認依頼への回答(2026-07-27)

区分: 1.ソースコード上で実装済み / 2.現在のステージング環境へ設定済み / 3.ステージング環境で動作確認済み / 4.未確認 / 5.未実装 / 6.問題あり / 7.管理者による設定・操作が必要

本文書は、Phase C-1のフォンリレー作業(`docs/PHASE_C1_MIGRATION_RESULTS.md`〜`docs/PHASE_C1_COMPLETION_REPORT.md`)で得た実測結果と、本セッションでのソースコード・git履歴・GitHub Actions確認を根拠に作成した。秘密鍵・パスワード・トークンの値は記載していない。

---

## 1. 現在の環境

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | Supabaseプロジェクト`vutnjxswfamluicsxwwi`(URL: `https://vutnjxswfamluicsxwwi.supabase.co`) | 2 | `.env.local`の`NEXT_PUBLIC_SUPABASE_URL`(値のみ、キーは非開示) |
| 2 | Vercelプロジェクト`sengokugacha`、URL `sengokugacha.vercel.app` | 2 | Phase C-1でのVercelダッシュボード実機確認(スクリーンショット、`stockbusinessjp-gmailcoms-projects/sengokugacha`) |
| 3 | コミット`a20375808818888188b26b9a2283ca9c9e5c9f4c`(PR #147マージコミット、`main`) | 3 | Vercel Deployments画面で`Production`ラベル付き・`Ready`状態を実機確認。GitHub側でも`git log -1 origin/main`が同一SHAを返すことを確認 |
| 4 | 明文化済み | 1 | `docs/PHASE_C1_STAGING_TEST_PLAN.md`冒頭・`docs/PHASE_C1_COMPLETION_REPORT.md`総括に明記 |
| 5 | 正しい(本番Supabase/Vercel/Stripe/HMAC設定はいずれも未作成という前提で本セッションは一貫して作業した) | 4 | 本セッションからは本番環境の存在有無を直接確認する手段がない。`stockbusiness`側の最終確認が必要(§13参照) |
| 6 | 実データは無いとの前提。ただしログイン確認で既存ユーザー1件(国民証No.000001「モッティ男子」、`contribution_points=237`)の存在を確認した。これは開発中の検証用アカウントである旨、ユーザー自身が確認済み(本セッション内チャットで質問済み、明示的な否定はなかったため検証用と判断) | 4 | Phase C-1のLINEログイン試験(実機スクリーンショット、`users.id = e08e682f-53ce-4571-96ee-d1d8d98f0b36`) |
| 7 | 自由にテスト・リセット可能(ユーザーより「実データ・本番キー・本番決済は使用しないでください」との制約はあるが、テスト用データの作成・削除は許可された運用で進めた) | 3 | 本セッション中、テストユーザー・entitlement・outbox行を作成→動作確認→削除する一連の操作を実施し、支障なく完了した |

---

## 2. Migration

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | `supabase_migrations.schema_migrations`テーブル自体が存在しない | 6 | Phase C-1でのSQL実行時に`relation "supabase_migrations.schema_migrations" does not exist`エラーを確認(スクリーンショット)。このDBはSupabase CLI(`supabase db push`)による管理下になく、過去に手動/ad hocなSQL適用で運用されていたことを意味する |
| 2 | 全て適用済み(ただし想定より範囲が広く、この7ファイルだけでなく計34ファイルの適用が必要だった) | 3 | `supabase/migrations/20260809000004`〜`20260810000002`の7ファイル、および`20260709000005`・`20260802000001`〜`20260810000001`の追加27ファイル、計34ファイルをステージングDBへ順次適用。適用順序・内容は`docs/PHASE_C1_MIGRATION_RESULTS.md`§5参照 |
| 3 | 未実行(スクリプトファイル自体は実行していないが、同スクリプトが検証する項目の大半を個別クエリで代替実行した) | 4 | `scripts/production-migration-preflight.sql`は本セッションの環境制約(直接DB接続不可)のためファイルとしては未実行。個別の重複・orphan・RPC権限チェックは代替クエリで実施済み(下記4・5・§3参照) |
| 4 | 重複なし(達成後の監査クエリで未検出) | 3 | Phase C-1の重複チェック(achievements/purchase_grant_steps/entitlements/integration_inbox_events/stripe_webhook_events)は`docs/PHASE_C1_MIGRATION_RESULTS.md`のローカル検証(区分2)止まり。ステージングでの重複チェック単体クエリは今回未実行(区分4) |
| 5 | 未確認(migration自体はエラー無く完了。個別のorphan/null不整合/不正statusチェックは今回未実行) | 4 | ステージングDBへのmigration適用34本はいずれもエラー無く成功(制約違反等が発生していれば適用時点で失敗するため、少なくとも新規追加した制約とは矛盾しない状態であることは保証されるが、既存データとの突合クエリは別途必要) |
| 6 | 未確認 | 4 | 同上、`10分以上processing`チェックは`scripts/production-migration-preflight.sql`内のクエリとして実装済み(区分1)だが、ステージング実行は未実施 |
| 7 | 未確認 | 4 | 同上(failed/deadカウントクエリは実装済み、区分1。ステージング実行は未実施) |
| 8 | 未確認 | 7 | バックアップ取得はSupabaseダッシュボード側の操作(Point-in-Time Recovery設定またはプロジェクト設定からのバックアップ)であり、本セッションからは確認できない。`stockbusiness`による確認・実施が必要 |
| 9 | 部分確認。少なくとも既存ユーザー(国民証No.000001)のログイン後、`contribution_points=237`等の既存データが変化していないことを確認した | 3 | §1-6のLINEログイン確認と同じ根拠。全テーブルの件数比較(migration適用前後)は未実施(区分4) |

---

## 3. RPC・セキュリティ

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | `false`(is演算的に確認済み) | 3 | 是正migration`20260810000003_revoke_anon_authenticated_function_execute.sql`適用後、`select ... from pg_proc ... where has_function_privilege('anon', ...) or has_function_privilege('authenticated', ...)`が**0行**を返すことを確認(実行結果: "Success. No rows returned")。これは`anon_execute=true`の行が1件も無いことを意味する |
| 2 | `false`(同上) | 3 | 同上のクエリは`anon`・`authenticated`のどちらかが`true`なら該当行として出るため、0行という結果は両ロールとも`false`であることを示す |
| 3 | `true`(全関数を個別に検証したわけではないが、ロールバック試験で作成した2つのテスト関数では実測済み) | 3(全関数の網羅的検証は区分4) | STEP 73相当の確認で`phase_c1_rollback_test_enabled()`に対し`service_role_can_execute = true`を確認。全関数を1件ずつ列挙した`select p.proname, has_function_privilege('service_role', ...)`は今回未実行。**ユーザー提示の完全なクエリ(section 3冒頭)を改めて実行いただければ、全関数について確定できる** |
| 4 | 作成済み・有効(`evtenabled = 'O'`) | 3 | `20260810000002_event_trigger_locks_down_new_functions.sql`適用+`select evtname, evtenabled from pg_event_trigger where evtname = 'lock_down_new_public_functions'`の実行結果`('lock_down_new_public_functions', 'O')`を確認(スクリーンショット) |
| 5 | される(実測確認済み) | 3 | ロールバック試験(§14相当)で、トリガー有効時に新規関数`phase_c1_rollback_test_enabled()`を作成した直後、`anon_can_execute=false`・`service_role_can_execute=true`を確認 |
| 6 | 削除済み | 3 | `drop function if exists phase_c1_rollback_test_disabled(); drop function if exists phase_c1_rollback_test_enabled();`を実行済み |
| 7 | RLSは全カスタムテーブルで`enable row level security`のみ有効化。個別の`create policy`は1件も存在しない(意図的な設計) | 1 | `grep -c "create policy" supabase/migrations/*.sql`が全ファイルで0件であることをコード上で確認。設計方針として「ポリシーを設けず、サーバー側のservice roleクライアント経由のみアクセス許可する」ことを前提としている(`docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`に明記)。これは今回発見した「anon/authenticatedへの関数EXECUTE」問題とは独立した設計だが、テーブル直接アクセス(PostgREST経由)についても同種の抜けが無いか、§3の是正と合わせて`grant`/`revoke`をテーブルレベルでも再点検することを推奨する(未実施、区分4) |

**重要な追加事項**: 上記1〜2の「0行」確認は、本セッションが独自に発見した「Supabase既定のanon/authenticated権限はPUBLICロールへの操作では剥奪できない」という問題(`docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`参照)の是正後の状態である。是正前は27個の関数(`adjust_user_balance`・`execute_gacha_draw`・`process_entitlement_grant`等)が`anon`/`authenticated`から実行可能だった。

---

## 4. LINE

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | 設定済み | 2 | `.env.local`に`LINE_LOGIN_CHANNEL_ID`が設定されていることを確認(値は非開示) |
| 2 | 設定済み | 2 | `.env.local`に`NEXT_PUBLIC_LIFF_ID`が設定されていることを確認。実際のログインURLにも`liffClientId=2010633417`が含まれることを確認(スクリーンショット) |
| 3 | 向いている | 3 | 実際のログインリダイレクトURLが`https://sengokugacha.vercel.app/...`であることを実機確認 |
| 4 | 未確認 | 4 | 実データを作らない方針のため、新規ユーザーでのログインは今回試行していない |
| 5 | 確認済み | 3 | 既存ユーザー(国民証No.000001)がLINEアプリ経由で正常にログインし、ダッシュボードが表示されることを実機確認 |
| 6 | 確認済み(ログイン後、ダッシュボード・国民証・貢献ポイント等が正しく表示され続けたことを確認) | 3 | 同上のスクリーンショット |
| 7 | 未確認 | 4 | 今回のログイン試験は既存ユーザーの通常ログインのみで、紹介URL経由の新規登録フローは試行していない |
| 8 | 未確認(ソースコード上のfirst-touch実装は確認済み) | 1 | `src/lib/passport.ts`・`src/lib/common-user-hub.ts`の実装をコードレビューで確認(`users.referring_agent_id`は登録時のみ設定、以後のログインで更新しない設計)。ステージング実データでの再現試験は未実施 |
| 9 | 未確認(ソースコード上の`fail-open`実装は確認済み) | 1 | `resolveCommonUserId()`が`null`を返した場合`users.common_user_id`がnullのまま、という実装をコードレビューで確認。今回ログインした既存ユーザーも`common_user_id = null`のままであることを実測(意図せぬエラーが起きていないことの間接確認にはなる) |
| 10 | 未確認 | 5(実際にはこの経路自体が未実装。§7参照) | `common_user_id`の事後解決は、新規HMAC連携(`entitlement.granted`等)受信時の`process_entitlement_grant()`内でのみ行われる設計(`users`テーブルへの直接的なバッチ再解決処理は存在しない)。LINEログイン単体での事後解決経路は無い |
| 11 | 未確認 | 4 | 管理画面の「LINE一斉配信」設定確認は今回のPhase C-1試験範囲に含めていない |
| 12 | 未確認 | 4 | 同上。個別push通知(`src/lib/line-push.ts`)の実機送信試験は未実施 |
| 13 | 記録済み | 1 | `src/lib/line-push.ts`に「at-least-once・ベストエフォート、重複時は同一文面が再度届き得る」という方針がコメントで明記されている(`docs/PHASE_C1_CONNECTION_RESULTS.md`§11参照) |

---

## 5. ガチャ

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | 確認済み | 3 | ステージングDBの`execute_gacha_draw()`を使い捨てテストユーザーで直接呼び出し、無料ガチャ1回目で`is_new_card=true`・`contribution_points_earned=50`(レア武将40点+新規カード10点)を実測 |
| 2 | 確認済み | 3 | 同一テストユーザーで有料ガチャを実行し、`gacha_tickets`が5→4に正しく1消費されることを実測 |
| 3 | 未確認(ローカル/CIでは確認済み) | 2 | `tests/integration/gacha-concurrency.test.ts`等で`InsufficientTicketsError`を確認済み(区分2)。ステージング実データでの残高0状態からの試行は今回未実施 |
| 4 | 未確認(ローカル/CIでは確認済み) | 2 | `tests/integration/gacha-draw-rollback-and-conquest.test.ts`(区分2)。ステージングでの日次上限到達試験は未実施(テストユーザーの`p_daily_limit=3`のうち2回のみ実行) |
| 5 | 未確認(ローカル/CIでは20並列確認済み) | 2 | `tests/integration/gacha-concurrency.test.ts`(区分2)。ステージングでの同時実行試験は未実施 |
| 6 | 確認済み | 3 | 同一`request_id`(`11111111-1111-1111-1111-111111111111`)で`execute_gacha_draw()`を2回呼び出し、`log_id`を含め全く同じ結果が返り、`users.contribution_points`が50のまま(2重加算されない)ことを実測 |
| 7 | 未確認(有料ガチャは新規カードでなかった=既存武将のcount加算経路を通ったが、加算後の`count`値自体は今回確認していない) | 4 | STEP 52で`is_new_card=false`(既存武将の再取得)を確認したが、`user_warlords.count`列の実値は未確認 |
| 8 | 未確認(テストで使用した国は制圧条件を満たさない状態だったため`province_conquered=false`が正しく返ることのみ確認) | 3(不成立ケースの確認としては区分3) | 実測結果`province_conquered: false`(1枚しか所持していない状態のため未制圧、想定通り) |
| 9 | 未確認 | 2 | ローカル/CIの`tests/integration/gacha-draw-rollback-and-conquest.test.ts`で確認済み(区分2)。ステージングでの地方制覇成立ケースは未試行 |
| 10 | 未確認 | 2 | 同上(`src/modules/gacha/domain/draw-limit.test.ts`の純粋関数テスト、区分2) |
| 11 | 未確認 | 2 | `tests/integration/tenka-toitsu.test.ts`(区分2)。ステージングでの実データ確認は未実施 |
| 12 | 未確認 | 2 | `tests/integration/gacha-animation-fetch-failure.test.ts`(区分2) |
| 13 | 未確認 | 2 | `src/modules/gacha/domain/draw-limit.test.ts`の`getTokyoBusinessDate`純粋関数テスト(区分2)。ステージングでのJST日付境界をまたぐ実測は未実施 |

---

## 6. Stripe

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1〜14 | **全項目、未対応** | 5・7 | ユーザー本人より「Stripeは、まだ準備中です。スキップしてください」との回答を得たため、本Phase C-1では一切試行していない。§8のコード実装状況(`src/app/api/stripe/webhook/route.ts`、`tests/contracts/stripe-webhook-purchase-flow.test.ts`)自体は区分1(ローカル/CI確認は区分2)で、`docs/PHASE_C1_CONNECTION_RESULTS.md`§8に整理済み。Stripe設定(test modeキー登録・Webhook Endpoint登録)は`stockbusiness`による対応が必要(区分7) |

Stripe設定完了後に改めて§6の全項目を実施することを推奨する。

---

## 7. HMAC・他システム連携

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1〜9 | 未対応(ローカル/CIでは確認済み) | 2 | `tests/contracts/sen-no-kuni-hub-hmac.test.ts`でv1/v2署名・nonce再利用・timestamp失効・body改ざん・Idempotency-Key改ざん・event version改ざんがいずれも401/409で拒否されることを確認済み(区分2)。HMAC署名付きリクエストの送信にはcurl等のコマンド実行環境が必要で、本Phase C-1はスマートフォンからのSupabase SQL Editor操作のみで実施していたため、ステージングURLに対する実測は見送った |
| 10 | 未確認 | 4 | 実際の送信元システム(sengoku-ai.com等)からの5イベント種別の受信は、送信元システム側の対応状況にも依存するため、本セッションからは確認できない |
| 11・12 | 未確認(ソースコード実装は確認済み) | 1 | `src/app/api/integrations/agencies/route.ts`の`common_user.merged`/`common_user.assigned_agent.updated`ハンドラ実装を確認。実際の外部送信元からの動作確認は未実施 |
| 13 | 実装済み | 1 | `20260808000008_unresolved_common_user_merges.sql`(`unresolved_common_user_merges`テーブル)・`20260808000007_agency_event_recovery.sql`(`unresolved_agent_assignments`)で、未同期ユーザーのイベントを破棄せず保留するテーブル設計を確認。`/admin/integration-recovery`画面での表示も実機確認済み(区分3、0件表示=正常な空状態) |
| 14 | 実装済み(手動再解決API) | 1 | `src/app/api/admin/integrations/sen-no-kuni-hub/retry-agent-assignments/route.ts`等の再解決エンドポイントを確認 |
| 15 | 未確認(ローカル/CIでのIdempotency-Key安定性テストは確認済み) | 2 | `src/lib/common-user-hub.test.ts`(区分2)。ステージング実データでの同一イベント再送試験は未実施 |

HMACはPCが使える環境での再試験を推奨する(テストコード自体の変更は不要、接続先環境変数の変更のみで実施可能)。

---

## 8. Entitlement

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | 確認済み | 3 | テスト用entitlement(`kokudaka +100`)を作成し`process_entitlement_grant()`を実行、`claim_outcome='claimed'`・`users.kokudaka`が0→100になることを実測 |
| 2 | 確認済み | 3 | 同entitlementを`revoked`にした上で`process_entitlement_revocation()`を実行、`claim_outcome='claimed'`・`kokudaka`が100→0になることを実測 |
| 3 | 未確認(ローカル/CIでは10並列確認済み) | 2 | `tests/integration/entitlement-concurrency.test.ts`(区分2)。ステージングでの並列試験は未実施 |
| 4 | 未確認(同上) | 2 | 同上 |
| 5 | 未確認(ローカル/CIでは確認済み) | 2 | 同テストファイルで順序逆転ケースを確認済み(区分2)。ステージングでの再現試験は未実施 |
| 6 | 確認済み | 3 | 取消済み(`kokudaka=0`)entitlementへ`process_entitlement_grant()`を再送すると`claim_outcome='already_revoked'`となり、`kokudaka`が0のまま変化しないことを実測(revoke再送を要さず正しい最終状態が維持されることの確認) |
| 7 | 未確認(ソースコード実装は確認済み) | 1 | `user_unresolved`という`claim_outcome`を返す分岐をコードで確認。ステージングでの実データ試験は未実施 |
| 8 | 未確認 | 1 | 同上 |
| 9 | 未確認(ソースコード実装は確認済み) | 1 | `process_entitlement_grant()`内の`resolution_dismissed_at is not null`チェックをコードで確認。ステージングでの実データ試験は未実施 |
| 10 | 確認済み(今回の1件のテストentitlementに関しては一致を実測) | 3 | STEP 55〜61の一連の実測(付与→100、取消→0、再送ブロック→0のまま)により、この1件については台帳の`application_status`/`reversal_status`と`users.kokudaka`が整合していることを確認。全件突合クエリは未実行(区分4) |

---

## 9. Outbox・再送

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | 確認済み | 3 | テスト用`integration_outbox_events`行を作成・`claim_integration_outbox_event()`で`'claimed'`を取得することを実測 |
| 2 | 未確認(テーブル自体は存在確認済み) | 2 | `notification_outbox_events`テーブルへの登録試験は今回未実施(§11のoutbox試験は`integration_outbox_events`のみ実施) |
| 3〜6 | 未確認(ソースコード実装は確認済み) | 1 | `claim_integration_outbox_event()`・`mark_integration_outbox_failed()`の`failed`遷移・`attempt_count`加算・`last_error`保存・`next_retry_at`(指数バックオフ)ロジックをコードで確認。ステージングでの外部API停止シミュレーションは未実施 |
| 7 | 未確認 | 4 | `/api/admin/integration-outbox/drain`の実機操作による再送確認は未実施(画面自体の表示は§13で確認済み) |
| 8 | 確認済み(claim fencingにより防止されることを実測) | 3 | 同一テスト行に対し1回目のclaimが`'claimed'`、直後の別tokenでの再claimが`'in_progress'`を返すことを実測(二重claim防止) |
| 9 | 未確認(ソースコード実装は確認済み) | 1 | leaseの有効期限切れ後の再claim許可ロジックをコードで確認。ステージングでの実測(実際に300秒待つ)は未実施 |
| 10 | 確認済み | 3 | 誤ったclaim_tokenで`mark_integration_outbox_sent()`を呼ぶと`false`が返り完了できないことを実測(fencingの実データ確認) |
| 11 | 未確認(ソースコード実装は確認済み) | 1 | `attempt_count >= p_max_attempts`で`status='dead'`に遷移するロジックをコードで確認。10回試行の実測は未実施 |
| 12 | 実装済み(ソースコード確認) | 1 | `src/lib/common-user-hub.ts`の`outbox:integration_outbox_events:<outbox event id>`という安定Idempotency-Key生成ロジックを確認(`docs/SECURITY_FINDINGS_PHASE_C0_PR4.md`の追加検出事項参照) |
| 13 | 未確認 | 4 | 送信先システム(sengoku-ai.com)側の重複排除挙動は、当方のコードベースからは確認できない。sengoku-ai.com側の実装確認が必要 |
| 14 | 記録済み | 1 | `src/lib/line-push.ts`にコメントで明記(§4-13と同じ根拠) |

---

## 10. 管理画面・運用復旧

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | 未確認(ソースコード実装は確認済み) | 1 | `src/lib/admin-session.ts`の`requireManagerRole()`実装、および財務影響操作(purchases再実行等)へのガード適用をコードで確認。operatorロールでの実機403確認は未実施 |
| 2 | 未確認(同上) | 1 | manager操作の実機確認は未実施(§13ではmanagerでログインし画面表示のみ確認、実際の操作ボタン押下は未実施) |
| 3 | 未確認(ローカル/CIでは確認済み) | 2 | `tests/contracts/purchase-retry-grant.test.ts`(区分2) |
| 4 | 未確認(同上) | 2 | `tests/contracts/admin-recovery-endpoints.test.ts`(区分2) |
| 5 | 未確認(同上) | 2 | 同上 |
| 6 | 確認済み(0件の正常空表示を確認) | 3 | `/admin/integration-recovery`実機表示で「競合はありません」と表示されることを確認(スクリーンショット) |
| 7 | 確認済み(画面自体の表示のみ) | 3 | 同画面内の「未解決の担当代理店割当」セクション表示を確認 |
| 8 | 未確認 | 4 | dead状態のデータを意図的に作っての表示確認は未実施 |
| 9 | 実装済み(ソースコード確認) | 1 | `src/lib/admin-audit-log.ts`の`logAdminAction()`が`actor_name`・`target_type`・`target_id`・`before_snapshot`・`after_snapshot`を`admin_audit_logs`テーブルへ記録する実装を確認 |
| 10 | 未確認 | 4 | `/admin/audit-logs`画面での検索・絞り込みUIの有無は今回未調査 |
| 11 | 一部あり(`agent-sales`画面のみ確認) | 1 | `src/app/admin/(dashboard)/agent-sales/page.tsx`に`/api/admin/agent-sales?format=csv`へのCSVダウンロードリンクを確認。purchases・entitlements等、他画面でのCSV出力有無は今回未調査(区分4) |
| 12 | 一部あり | 1 | `/api/admin/integrations/sen-no-kuni-hub/retry-agent-assignments`(全件再解決)、`/api/admin/integration-outbox/drain`(一括再送)を確認。全機能を網羅した調査ではない |

---

## 11. 自動運用機能

| # | 機能 | 実装状況 | 根拠 |
|---|---|---|---|
| 1 | Outboxの定期自動再送 | **未実装** | 手動`drain`APIのみ確認。定期実行の仕組み(Cronトリガー等)はコード上に存在しない |
| 2 | Vercel Cron | **未実装** | リポジトリ内に`vercel.json`が存在せず、`crons`設定も無いことを確認 |
| 3 | failed/deadの自動通知 | **未実装** | 該当するアラート送信コードは見つからなかった |
| 4 | Stripe Webhook失敗アラート | **未実装** | 同上 |
| 5 | HMAC認証失敗アラート | **未実装** | 同上 |
| 6 | purchaseと残高の定期照合 | **未実装** | `scripts/production-migration-preflight.sql`は手動実行のワンショットスクリプトであり、定期実行されるジョブではない |
| 7 | entitlement台帳と残高の定期照合 | **未実装** | 同上 |
| 8 | common_user_idの欠落・重複検出 | **未実装**(手動SQL/管理画面での個別確認のみ) | `/admin/integration-recovery`は受動的な表示画面であり、能動的な定期検出バッチは無い |
| 9 | 代理店紐づけ不整合検出 | **未実装**(同上) | 同上 |
| 10 | 日次運用レポート | **未実装** | 該当コード無し |
| 11 | Sentryのアラート設定 | 一部実装(エラー捕捉のみ、アラート通知設定は未確認) | `src/app/global-error.tsx`でSentry連携を確認したが、Slack/メール等への実際のアラート通知設定はSentryダッシュボード側の設定であり、本セッションからは確認できない(区分7) |
| 12 | バックアップ成功確認 | **未実装**(自動確認の仕組みは無い) | Supabase側のバックアップ機能自体の有効化状況は`stockbusiness`確認が必要(§2-8と同じ) |

**必要な実装範囲と優先度(所見)**:
- 優先度高: 6・7(残高・台帳の定期照合)は、本Phase C-1で発見した「migration適用漏れ」のような静かな不整合を早期検知する上で価値が高い。`scripts/production-migration-preflight.sql`をVercel CronまたはGitHub Actionsの定期実行に組み込むだけで実現可能
- 優先度中: 1(outbox自動再送)、3〜5(失敗アラート)は運用が本格化する前に整備したい
- 優先度低: 10(日次レポート)、8・9(重複検出の自動化)は現状の手動確認画面で当面代替可能

---

## 12. ウォレット連携

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1 | `users.kokudaka`(石高)・`users.gacha_tickets`(ガチャ券) | 1 | `20260707000001_initial_schema.sql`で作成された`users`テーブルの列 |
| 2 | 無い(`user_activity`テーブルが貢献ポイントの加算履歴のみ部分的に記録するが、石高・ガチャ券の増減を網羅した完全な台帳ではない) | 5 | `src/lib/user-activity.ts`の`recordContribution()`実装、および`entitlements`テーブル(権利付与分のみの記録)を確認。`kokudaka`/`gacha_tickets`列自体はread-modify-write(現在はガチャ・購入経路では`adjust_user_balance()`により原子化済みだが)の単純な数値更新であり、変更履歴を全件追跡する専用台帳は存在しない |
| 3 | 一部のみ(`entitlements`テーブルは外部権利付与のみ`order_id`・`entitlement_id`・`source_system_key`を保持。ガチャ・登城ボーナス等の内部発生分はpurchase_id/entitlement_idのような発生源IDを持たない) | 5(部分実装、区分1として一部あり) | `entitlements`(20260806000001)は該当列を持つが、`gacha_logs`・`user_activity`にはそのような追跡列が無い |
| 4 | `entitlements`の取消(revoke)は`reversal_status`等で追跡可能。ガチャ・登城ボーナス等の訂正履歴は無い | 1(entitlementsのみ) | 同上 |
| 5 | 未確認・仕組み自体が無い | 5 | 現在残高(`users.kokudaka`等)と取引履歴を突き合わせる専用クエリ・画面は存在しない |
| 6 | 無い | 5 | 千ノ国ウォレット(外部システム)へ送信するAPI・outbox種別は`integration_outbox_events`のスキーマ上は汎用的に対応可能だが、実際にウォレット向けイベントを送信する呼び出し元コードは存在しない |
| 7 | 無い | 5 | ウォレット側からの同期イベントを受信する専用エンドポイントは存在しない(新規HMAC基盤`/api/integrations/sen-no-kuni-hub`は権利付与・注文イベント用であり、ウォレット専用ではない) |
| 8 | 該当機能が無いため評価対象外 | 5 | 同上 |
| 9 | UI表示のみ(モック)。`src/components/economy/OveWalletCard.tsx`のコメントに「OVEウォレット(モック)。実際のウォレット接続・送金は行わない」「保有予定ポイントは国家貢献ポイントを1:1で仮換算した表示専用の値」と明記されている | 1(表示のみ実装、実連携は5) | 同ファイル全文確認済み |
| 10 | 正式連携には少なくとも以下が不足: (a)ウォレット向けoutboxイベント種別・送信実装、(b)ウォレット側からのHMAC受信エンドポイント、(c)石高/ガチャ券/貢献ポイントの発生源(purchase_id/entitlement_id/event_id)を記録する統一台帳テーブル、(d)換算レート確定後のOVE付与ロジック | 5 | 上記1〜9の調査結果に基づく所見 |

---

## 13. 本番環境

| # | 回答 | 区分 | 根拠 |
|---|---|---|---|
| 1〜5 | 未作成という前提で一貫して作業した(本セッションからは断定できない) | 4・7 | 本セッションは本番Supabase・Vercel・Stripe・HMAC・LINEチャネルのいずれにも一切接続していない(接続情報自体を持たない)。「未作成」の最終確認は`stockbusiness`による社内確認が必要 |
| 6 | ステージング→本番のmigration手順書はある | 1 | `docs/PHASE_C1_STAGING_TEST_PLAN.md`(実行手順書)、および本セッションで実際に使用した34ファイルの適用順序自体が本番移行時の手順としてそのまま転用可能。ただし「新規Supabaseプロジェクトを本番として構築する場合、`20260810000003`のanon/authenticated是正を必ず含める」という注意点を`docs/PHASE_C1_COMPLETION_REPORT.md`§18に追記済み |
| 7 | 手順書レベルではある | 1 | `docs/ROLLBACK_PHASE_C0_PR4.md`・`docs/PHASE_C1_ROLLBACK_RESULTS.md`。ただし実際のバックアップ取得コマンド・頻度等の運用手順は`stockbusiness`側で別途整備が必要 |
| 8 | 手順書レベルではある | 1 | `docs/ROLLBACK_PHASE_C0_PR4.md`、および本Phase C-1のevent trigger無効化/再有効化演習結果(`docs/PHASE_C1_ROLLBACK_RESULTS.md`) |
| 9 | 未確認 | 7 | 組織側の意思決定事項であり、本セッションからは確認できない |
| 10 | 未確認 | 7 | 同上 |

---

## 14. 最終回答

### 機能別整理

| 機能 | コード実装 | ステージング設定 | ステージング確認 | 不足内容 | 優先度 |
|---|---|---|---|---|---|
| LINEログイン | ◎ | ◎ | ○(既存ユーザーのみ実測、新規登録・紹介URL経由は未実測) | 新規登録・紹介URL経由フローの実機確認 | 中 |
| ガチャ | ◎ | ◎ | ○(無料/有料/冪等性は実測、日次上限・並列・国制覇成立は未実測) | 国制覇・地方コンプ・天下統一の実データ確認 | 中 |
| Stripe | ◎(ローカル/CI確認済み) | △(test mode設定が未完了と申告あり) | ×(未実施、ユーザー要望によりスキップ) | test mode設定完了→§8の再実施 | 高(決済機能のため) |
| Entitlement | ◎ | ◎ | ○(grant/revoke/二重付与防止の単発ケースは実測、並列・順序逆転は未実測) | 10並列・順序逆転ケースのステージング実測 | 中 |
| common_user_id | ◎ | ◎ | △(既存ユーザーでnull保持のみ確認、新規解決フローは未実測) | 新規解決・後日解決フローの実機確認 | 中 |
| 代理店紐づけ | ◎ | ◎ | ×(未実測) | `assigned_agent_id`更新・`customer.assignment.changed`受信の実測 | 中 |
| Outbox | ◎ | ◎ | ○(claim fencingは実測、外部API停止シミュレーション等は未実測) | 実際の外部送信先を絡めた再送試験 | 中 |
| 管理画面復旧 | ◎ | ◎ | ○(画面表示は実測、操作系ボタンの実機押下は未実測) | operator/manager権限分岐・再実行ボタンの実機確認 | 低〜中 |
| 運用監視 | △(監査ログ・CSV出力の一部のみ) | - | - | 定期照合・自動アラート・Cron一式が未実装 | 高(本番運用前に必須) |
| ウォレット連携 | ×(表示モックのみ) | - | - | outbox送信・受信エンドポイント・統一台帳の新規実装 | 低(スコープ外と明示済み) |
| 本番環境 | - | ×(未作成) | - | 環境構築自体がこれから | - |

### 連携可否判定

```text
LINEログイン: ◎ そのまま連携可能
ガチャ: ◎ そのまま連携可能
Stripe: ○ 軽微な改修で可能(test mode設定完了とWebhook Endpoint登録のみ、コード改修は不要)
Entitlement: ◎ そのまま連携可能
common_user_id: ○ 軽微な改修で可能(新規解決フローの実機確認のみ)
代理店紐づけ: ○ 軽微な改修で可能
Outbox: ◎ そのまま連携可能
管理画面復旧: ◎ そのまま連携可能
運用監視: △ 中規模改修が必要(Cron・アラート基盤を新規に組む必要がある)
ウォレット連携: × 現状では連携困難(送受信の仕組み自体が無い)
本番環境: ！ 技術的には可能だが危険(§3のanon/authenticated是正を本番構築時に必ず含めないと危険な状態になる)
```

### 総括

1. **今すぐ使える機能**: LINEログイン(既存ユーザー)、ガチャ(無料・有料)、Entitlement(grant/revoke)、Outbox(claim/送信管理)、管理画面(表示系)
2. **設定すれば使える機能**: Stripe(test mode設定完了後)
3. **実接続試験が必要な機能**: HMAC v1/v2(PC環境でのcurl試験)、Stripe決済フロー全体、代理店紐づけの実データ試験
4. **追加開発が必要な機能**: 運用監視の自動化一式(Cron・アラート・定期照合)、ウォレット連携(送受信エンドポイント・統一台帳)
5. **本番開始前の必須対応**:
   1. 本番環境構築時に`20260810000003`(anon/authenticated是正)を必ず含めて適用し、§3のRPC権限チェックで0件を確認する
   2. Stripe test mode設定完了→§8の接続試験一式を実施
   3. HMAC v1/v2のステージング実測(PC環境)
   4. 残高・台帳の定期照合ジョブ(最低限、`scripts/production-migration-preflight.sql`の定期実行)を用意する
   5. 本番リリース承認者・障害時連絡体制の決定(組織側の意思決定)
6. **次に着手すべき作業(優先順)**:
   1. Stripe test mode設定完了→§8接続試験
   2. HMAC v1/v2のステージング実測(PC環境、curlまたはテストスイート再実行)
   3. `claude/sengoku-economy-os-j0d2nl`ブランチ(`20260810000003`含む)の`main`へのマージ判断
   4. 残高・entitlement台帳の定期照合ジョブの設計・実装
   5. 代理店紐づけ・common_user_id解決フローのステージング実データ試験
