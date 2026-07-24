# 千ノ国パスポート モジュール化後バグ修正 テスト結果

`SEN_NO_KUNI_PASSPORT_POST_MODULARIZATION_BUGFIX_INSTRUCTIONS.md`の提出物。

## 検証方針

本リポジトリにはDB統合テスト基盤が無く、Postgres関数の並行実行安全性を自動テストで実地検証する手段が無い。ユーザー確認の上、**コードレビューのみで進める**方針とした。各PRで以下の標準テストコマンドを実行し、既存の回帰が無いことを確認する。並行実行に関する受入条件(§17)は、本番投入前にユーザー側での実地検証を要する。

```
rm -rf .next
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
```

## PR1: fix: atomically claim purchase grant steps

| コマンド | 結果 |
|---|---|
| `rm -rf .next && npx tsc --noEmit` | エラーなし |
| `npm run lint` | 0 errors, 2 warnings(既存の`<img>`警告のみ、本作業と無関係) |
| `npx vitest run` | 150/150 pass(変更なし。本PRはDB依存のためunit test化不可) |
| `npm run build` | 成功 |

### 未実施の検証(§17の受入条件のうち)

- 同じ購入を何回再実行しても残高は1回分
- 同一購入を10並列実行しても副作用は1回
- 副作用成功後にプロセスを落としても二重処理されない(**PR1時点では未達、PR2で対応予定**。`docs/IMPLEMENTATION_STATUS_BUGFIX.md`の「未解決の既知の制約」参照)

上記はDB統合テスト環境(Supabase local等)が無いと自動検証できない。SQLのロジックレビュー(`docs/IMPLEMENTATION_HISTORY_BUGFIX.md`参照)は実施済みだが、実行結果としての確認はできていない。

## PR2: fix: make balance grants transactional and idempotent

| コマンド | 結果 |
|---|---|
| `rm -rf .next && npx tsc --noEmit` | エラーなし |
| `npm run lint` | 0 errors, 2 warnings(既存の`<img>`警告のみ、本作業と無関係) |
| `npx vitest run` | 150/150 pass(変更なし。本PRはDB依存のためunit test化不可) |
| `npm run build` | 成功 |

### 未実施の検証(§17の受入条件のうち)

- 同じ購入を何回再実行しても残高は1回分(`balance_granted`/`agent_sale_recorded`はPR2でtrue all-or-nothingを実現、コードレビュー上は解消と判断)
- 同一購入を10並列実行しても副作用は1回
- 副作用成功後にプロセスを落としても二重処理されない(`balance_granted`/`agent_sale_recorded`はPR2で解消。`plot_completed`/`commission_posted`/`notification_sent`/`referral_confirmed`は未対応のまま残存)

上記はDB統合テスト環境(Supabase local等)が無いと自動検証できない。SQLのロジックレビュー(`docs/IMPLEMENTATION_HISTORY_BUGFIX.md`参照)は実施済みだが、実行結果としての確認はできていない。

## PR3: fix: atomically apply and reverse entitlements

| コマンド | 結果 |
|---|---|
| `rm -rf .next && npx tsc --noEmit` | エラーなし |
| `npm run lint` | 0 errors, 2 warnings(既存の`<img>`警告のみ、本作業と無関係) |
| `npx vitest run` | 150/150 pass(変更なし。本PRはDB依存のためunit test化不可) |
| `npm run build` | 成功 |

### 未実施の検証(§5.7の受入条件のうち)

- 同じgrantを10並列送信しても1回だけ付与
- 異なるevent_idで同一entitlementを送信しても1回だけ付与
- 同じrevokeを10並列送信しても1回だけ取消
- 付与成功後、状態更新前に障害を起こしても二重付与されない(`process_entitlement_grant()`の単一トランザクション化により、コードレビュー上は解消と判断)
- 取消成功後、状態更新前に障害を起こしても二重取消されない(同上)
- `user_id=null`の既存entitlementが後から解決・付与できる(`process_entitlement_grant()`内の再解決ロジックにより、再送を受けた場合のみ解消。管理画面からの手動トリガーは未対応)
- revoke先行時も最終状態がrevoked(既存のP0-2実装を維持、本PRでの変更なし)

上記はDB統合テスト環境(Supabase local等)が無いと自動検証できない。SQLのロジックレビュー(`docs/IMPLEMENTATION_HISTORY_BUGFIX.md`参照)は実施済みだが、実行結果としての確認はできていない。

## PR4: fix: atomically claim Stripe webhook inbox events

| コマンド | 結果 |
|---|---|
| `rm -rf .next && npx tsc --noEmit` | エラーなし |
| `npm run lint` | 0 errors, 2 warnings(既存の`<img>`警告のみ、本作業と無関係) |
| `npx vitest run` | 144/144 pass(`decideStripeInboxAction()`のテスト5件を削除したため150→144に減少。それ以外のテストに変更・回帰なし) |
| `npm run build` | 成功 |

### 未実施の検証(§6.3の受入条件のうち)

- 同じStripe eventを10並列送信しても購入処理は1回だけ(`claim_stripe_webhook_event()`が`SELECT ... FOR UPDATE`で行ロックを取得したまま状態遷移するため、コードレビュー上は解消と判断)
- unique違反がHTTP 500にならない(claim関数内の`ON CONFLICT DO NOTHING`+行ロックにより、呼び出し元にunique制約違反が伝播しない設計。コードレビュー上は解消と判断)
- processing中イベントを別処理が再実行しない(`in_progress`判定により解消と判断)
- lease切れ後の再claimで古いworkerが状態更新できない(`mark_stripe_webhook_succeeded`/`mark_stripe_webhook_failed`のclaim_token一致チェックにより解消と判断)

上記はDB統合テスト環境(Supabase local等)が無いと自動検証できない。SQLのロジックレビュー(`docs/IMPLEMENTATION_HISTORY_BUGFIX.md`参照)は実施済みだが、実行結果としての確認はできていない。

## PR5: feat: support HMAC signature v2 alongside v1

| コマンド | 結果 |
|---|---|
| `rm -rf .next && npx tsc --noEmit` | エラーなし |
| `npm run lint` | 0 errors, 2 warnings(既存の`<img>`警告のみ、本作業と無関係) |
| `npx vitest run` | 159/159 pass(`sen-no-kuni-hub-signature.test.ts`の新規テスト15件追加に伴い144→159) |
| `npm run build` | 成功 |

### §7.4の必須検証のうちunit test確認済み

- nonce変更で署名不一致 → `buildV2CanonicalString()`のnonce変更によるcanonical string変化を確認
- Idempotency-Key変更で署名不一致 → 同上、idempotencyKey変更によるcanonical string変化を確認
- event version変更で署名不一致 → 同上、eventVersion変更によるcanonical string変化を確認
- key ID変更で署名不一致 → 同上、keyId変更によるcanonical string変化を確認
- raw body変更で署名不一致 → 同上、rawBody変更(sha256ハッシュ値経由)によるcanonical string変化を確認

canonical stringが変化すればHMAC署名も(暗号学的に無視できる確率を除き)変化するため、上記はunit testで実質的に検証済みと判断する。

### 未実施の検証(§7.4の受入条件のうち)

- timestamp期限切れ(v1と同じくDB非依存だが`Date.now()`依存のため、既存のタイムスタンプ検証ロジックと合わせてコードレビューのみで確認)
- nonce再利用(既存のnonce unique制約に依存するためDB統合テストが必要)
- v1/v2併存時の実際のHTTPリクエストレベルでの検証(curlでの自作署名リクエスト送信によるE2E確認、指示書§7.4冒頭で言及されている実地検証)

上記はDB統合テスト環境(Supabase local等)が無いと自動検証できない。本番投入前にユーザー側での実地検証(curlでの署名検証、既存sengoku-ai.com連携・既存v1接続への回帰確認含む)を要する。
