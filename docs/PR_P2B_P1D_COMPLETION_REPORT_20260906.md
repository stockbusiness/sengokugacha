# PR-P2b / PR-P1d 完了報告

- 作成日: 2026-09-06
- 対象: `stockbusiness/sengokugacha`（Passport）
- 本番 `main`: `607977e04f1290767e9aba1b142fa6d6fac65c8e`

---

## 1. PR-P2b 商品所有者マップ

| 項目 | 内容 |
|---|---|
| PR | https://github.com/stockbusiness/sengokugacha/pull/178 |
| CI | https://github.com/stockbusiness/sengokugacha/actions/runs/32583640774（9件すべて成功） |
| マージ後の SHA | `51f23ec8417996b6249b26eef72edcb8f9e67442` |
| マイグレーション | `20260821000001_product_ownership` |
| 本番適用 | ✅ 完了 |

### DB確認結果（ご指定の8項目）

| # | 項目 | 結果 |
|---|---|---|
| 1 | 適用前 `entitlements` 件数 | **0** |
| 2 | 適用後 `entitlements` 件数 | **0** |
| 3 | 適用したマイグレーションID | `20260821000001_product_ownership` |
| 4 | `schema_migrations` 登録 | **1** |
| 5 | `entitlement_source_allowlist` 件数 | **0**（空で出荷。これが正しい状態） |
| 6 | 商品コードなしの判定 | `PRODUCT_CODE_REQUIRED` |
| 7 | 商品コードと種別不一致の判定 | `PRODUCT_TYPE_MISMATCH` |
| 7b | 担当外コード（`tenka_pass` 等） | `PRODUCT_NOT_OWNED` |
| 7c | `SPPT_LAND_PLOT` + `land_plot` | `TYPE_NOT_APPLICABLE` |
| 8 | 不正な付与で残高が変化しないこと | 国高 **0 → 0** |
| 9 | 正常付与と取消が同じ商品コード条件で動くこと | 取消 = `claimed`、国高 **0 → 0** |
| 10 | 旧2引数版関数の残存 | **0** |

9 の「取消 = `claimed`」は、**付与で残高が実際に入り、取消でそれが戻った**ことを意味します（何も入っていなければ `reversed_without_balance_change` になります）。往復して元の値に戻っているため、商品コード条件が付与・取消の両方で正しく効いていることが確認できました。

適用スクリプトは `entitlements` が0件でなければ自動的に中断する安全ゲート付きで、検証用の行は必ず削除する作りです。

---

## 2. PR-P1d 支払済み操作の排他と件数表示

| 項目 | 内容 |
|---|---|
| PR | https://github.com/stockbusiness/sengokugacha/pull/180 |
| CI | https://github.com/stockbusiness/sengokugacha/actions/runs/34066757708（9件すべて成功） |
| マージ後の SHA | `607977e04f1290767e9aba1b142fa6d6fac65c8e` |
| マイグレーション | `20260822000001_payout_exclusivity` |
| 本番適用 | ✅ 完了 |

### DB確認結果

| 項目 | 結果 |
|---|---|
| 関数 `create_payout_for_recipient` | **1**（存在） |
| 権限 | `postgres` と `service_role` のみ（PUBLIC EXECUTE は剥がれている） |
| `schema_migrations` 登録 | **1** |
| 動作確認（存在しない受取者で1回呼ぶ） | `no_target` |
| `payouts` 件数 | **0**（行は作られていない） |
| `commission_ledger` 件数 | **0** |

### 対応した3点

| # | 項目 | 対応 |
|---|---|---|
| 1 | 二重実行防止 | 対象抽出・`payouts`作成・ledger更新を DB関数の1トランザクションへ移し、対象行を `for update` でロック |
| 2 | 対象件数の表示 | 一覧と確認ダイアログに件数を表示 |
| 3 | 監査ログの失敗 | `logAdminActionWithResult()` を追加し、応答へ `auditLogged` を含める |

`logAdminAction()` 自体は変更していません（106箇所から呼ばれており、失敗時の挙動を変えると影響範囲が読めないため）。監査ログが書けなくても支払記録は成功させます。

### ローカル実DBで二重計上を再現し、解消も確認

C3 で「起きうる」と書いた現象を、2セッションを交錯させて実際に出しました。

| | payouts件数 | payouts合計 | ledger合計 |
|---|---|---|---|
| ロックなし | **2** | **12,000円** | 6,000円 ← 食い違い |
| `for update` あり | 1 | 6,000円 | 6,000円 ← 一致 |

### 実装中に見つけて直した不具合

OUT パラメータ `payout_id` が `commission_ledger.payout_id` と衝突し、`column reference "payout_id" is ambiguous` で実行時に落ちていました。列参照をテーブル名で修飾して解消。**SQL を読むだけでは気づかず、ローカル実DBで実際に呼んで発見**したものです。

---

## 3. staging 試験結果

**提出できません。** 理由は2点です。

| # | 理由 |
|---|---|
| 1 | Wallet staging の接続情報が未受領（`WALLET_REPLY_2_20260822.md` で依頼中、未送付） |
| 2 | 当作業環境に Docker デーモンが無く、Supabase local を起動できない |

代わりに、**ローカル PostgreSQL 16 に空DBから全88マイグレーションを適用**したうえで、実DBに対する検証を行っています（上記の再現テストを含む）。CI 側では Supabase local が起動するため、`integration-test` / `contract-test` / `migration-test` が実環境相当の検証を担っています。

PR5-b の staging 試験4項目（再送・応答喪失・nonce 再利用・上限超過）は、接続情報の受領後に実施してご報告します。

---

## 4. `common_user_id` 未解決の本番19名

ご指示のとおり、次は**行っていません**。

- `users.id` を暫定的に `external_user_id` として送信する
- メールアドレスや LINE ID を代替識別子として送信する
- 未解決の `common_user_id` を推測して紐付ける
- Agency との接続前に既存19名を自動統合する

**代理店システム側で解決されるまで、本番送信を開始しません。**

---

## 5. 指示書対応の全体状況

| PR | 内容 | 本番反映 |
|---|---|---|
| #164 | マイグレーション適用漏れ検知 | ✅ |
| #165 | PR-P3 OVE誤表示の是正 | ✅（DB変更なし） |
| #167 | PR-P1a 旧commission新規計上停止 | ✅ |
| #169 | PR-P1b 管理画面の清算専用化 | ✅（DB変更なし） |
| #170 | PR-P1c 販売成果Outbox | ✅ |
| #171 / #172 | PR5-a Wallet送信基盤 | ✅ |
| #173 / #174 | PR-P2a Entitlement allowlist | ✅ |
| #176 | PR-P4 管理Cookieのフォールバック廃止 | ✅（2026-08-22 22:18 JST） |
| **#178** | **PR-P2b 商品所有者マップ** | ✅ **本報告** |
| **#180** | **PR-P1d 支払済み操作の排他** | ✅ **本報告** |
| — | PR5-b Wallet HTTPアダプタ | ❌ 未着手（受領物6点待ち） |

マイグレーションは全88本が本番に適用済みです。

---

## 6. 残っているもの

| # | 内容 | 担当 |
|---|---|---|
| 1 | **Wallet 担当者へ返信案2を送付**（`WALLET_REPLY_2_20260822.md` 第2部） | 運営 |
| 2 | PR5-b 計画の承認（`PR5B_WALLET_HTTP_ADAPTER_PLAN_20260823.md`、確認事項5点） | 運営 |
| 3 | C5 デプロイ後の画面確認7項目（記録用。`/admin/operations-health` は88件表示になるはず） | 運営 |
| 4 | C7 `common_user_id` 本番19名の解決 | 代理店システム側 |

**1 が PR5-b 最大のボトルネック**です。Go 条件11項目のうち5項目（HMAC 契約テスト・鍵 runbook・単発照会・CSV照合・staging試験）が、この返信を起点にしか動きません。

## 運用メモ

将来ゲーム送信元を接続する際は、次の**3つ**が揃って初めて残高が動きます。

1. `sen_no_kuni_hub_settings` への鍵登録 → 認証を通せるようになる
2. `entitlement_source_allowlist` への登録 → 残高適用が許可される
3. イベントに正しい `product_code`（`SPPT_KOKUDAKA` / `SPPT_GACHA_TICKET` / `SPPT_LAND_PLOT`）を含める → 商品条件を通る

いずれか1つでも欠けると残高は動かず、理由が `entitlements.application_decision` に記録されます。`GET /api/admin/entitlements/not-applied` で理由つきの一覧を読めます。
