# 千ノ国パスポート P0-2 実装状況(冪等性・再試行安全化)

`SEN_NO_KUNI_PASSPORT_P0_2_INSTRUCTIONS.md` で指摘された、全体統合対応(PR1-8、`docs/sen-no-kuni-integration-completion-report.md`)実装の冪等性・排他制御バグへの対応状況をまとめる。

## ステータス区分

各項目は以下6段階のいずれかで評価する。

1. **ソースコード上で実装済み** — コードは書かれ、`tsc`/`lint`/`build`を通過している
2. **自動テストで確認済み** — vitestによる自動テストが存在し、通過している
3. **ローカル・テスト環境で接続確認済み** — 実際のHTTPリクエスト・DBを使った動作確認済み
4. **本番環境で確認済み** — 本番相当環境での実接続確認済み
5. **実環境確認待ち** — 実装済みだが、送信元システムとの実接続が無く未検証
6. **未対応** — 今回のP0-2スコープに含まれない、または着手していない

本リポジトリはサンドボックス環境で開発されており、Supabase実インスタンス・送信元システムとの実接続テストは実施できない。そのため本書のほぼ全項目は**5. 実環境確認待ち**が上限となる。

## バグ対応状況

| # | バグ内容 | 対応PR | ステータス | 備考 |
|---|---|---|---|---|
| 1 | `runPurchaseGrant()`の残高付与が再試行で二重実行され得る | PR-A(#106) | 5. 実環境確認待ち | `purchase_grant_steps`によるステップ単位冪等化。ロジックはコードレビューで確認済みだが、実際のStripe再送・並行リクエストでの検証は未実施 |
| 2 | 権利付与再実行APIに排他制御が無い | PR-A(#106) | 5. 実環境確認待ち | `grant_status: failed→retrying`の原子的UPDATE。複数タブでの同時クリック等の実地検証は未実施 |
| 3 | `handleEntitlementGranted()`が残高未反映のまま`entitlement_id`重複でreturnする | PR-B(#107) | 5. 実環境確認待ち | `application_status`で残高反映状態を独立管理。実際の`entitlement.granted`再送での検証は未実施(エンドポイント自体が未接続) |
| 4 | `handleEntitlementRevoked()`の状態更新順序による再試行不能 | PR-B(#107) | 5. 実環境確認待ち | `reversal_status`で取消状態を独立管理 |
| 5 | `claimInboxEvent()`の並行リクエストで二重処理 | PR-C(#108) | 5. 実環境確認待ち | `claim_integration_inbox_event()` Postgres関数(`INSERT ON CONFLICT`+`SELECT FOR UPDATE`)による原子化。同時リクエストでの実地検証は未実施 |
| 6 | `source_system_key`が未検証のリクエスト本文由来 | PR-B(#107)、PR-D(#109) | 1. ソースコード上で実装済み | `identity.systemKey`(HMAC認証済み)を正とするよう変更。ロジック上は完結しているため実接続不要でこのステータスとする |
| 7 | `X-Event-Version`未検証、`Idempotency-Key`/`event_id`不一致未チェック | PR-D(#109) | 5. 実環境確認待ち | サポートバージョンは`"1.0"`固定で暫定実装。実際の契約書バージョン体系との整合は未確認 |

## 追加対応(P0-2で新たに識別した関連ギャップ)

| 項目 | 対応PR | ステータス | 備考 |
|---|---|---|---|
| `shopping_order_events`のevent_id一意性がsource_system_key単位でない(§6.1) | PR-E(#110) | 1. ソースコード上で実装済み | 実接続実績が無いため既存データ移行の再現性は未検証 |
| `sen_no_kuni_hub_used_nonces`の無制限増加(§6.4) | PR-E(#110) | 5. 実環境確認待ち | 管理者トリガーAPIのみ。管理画面ボタンは未設置 |
| `common_user.merged`競合がログのみで消える | PR-F(#111) | 5. 実環境確認待ち | `common_user_merge_conflicts`に永続化。管理画面での閲覧は未実装 |
| `assigned_agent`割当の未解決ケースが復旧不能 | PR-F(#111) | 5. 実環境確認待ち | `unresolved_agent_assignments`+管理者トリガーAPI |
| 明示的な担当解除(null)の未対応 | PR-F(#111) | 5. 実環境確認待ち | フィールド明示null時のみ解除と判定 |

## 未対応事項(今回のP0-2スコープに含めなかったもの)

- **管理画面UI**: nonceクリーンアップ・merge競合閲覧・未解決assigned_agent再解決の3つの管理者向け操作は、いずれもAPIのみでUIボタンは未設置。`sen_no_kuni_hub_settings`(HMAC鍵)自体を管理するUIも未実装のため、専用の統合管理画面を新設するタイミングで合わせて対応する必要がある。
- **実接続テスト**: `/api/integrations/sen-no-kuni-hub`は鍵未発行のため実際のイベント受信実績が無い。本書の「5. 実環境確認待ち」項目はすべてこれに起因する。
- **`integration_outbox_events`の実際の送信・自動再送**: PR5(全体統合対応)時点から変更なし。テーブル・書込関数のみで、外部への実送信・自動再送ロジックは未実装。「再送基盤実装済み」という表現は正確ではなく、正しくは「outbox記録基盤のみ実装済み、外部送信・自動再送は未実装」である。
- **`X-Event-Version`のサポートバージョン体系**: 実際の`00_COMMON_INTEGRATION_CONTRACT.md`のバージョン番号体系と、本実装が暫定的に定めた`"1.0"`が一致する保証は無い。
