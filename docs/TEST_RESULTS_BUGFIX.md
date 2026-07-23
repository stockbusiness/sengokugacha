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
