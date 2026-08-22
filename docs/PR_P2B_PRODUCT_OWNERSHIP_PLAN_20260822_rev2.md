# PR-P2b 実装計画 rev2 — 商品所有者マップ

- 作成日: 2026-08-22
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: `01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` PR-P2、Q5・Q6、**2026-08-22 のご判断（確認事項1〜7）**
- 起点: `main` = `2d5882e`
- 初版: `PR_P2B_PRODUCT_OWNERSHIP_PLAN_20260822.md`（本書が上書きします）
- **本計画の承認を受けるまで、コード変更・マイグレーション作成は行いません。**

---

## 0. 初版からの変更点

| 確認事項 | 初版 | ご判断 | 本書 |
|---|---|---|---|
| 1 | `tenka_pass` / `castle_lord_plan` を含めるか照会 | **含めない** | 3商品に限定。既存の購入処理・表示には触れない |
| 2 | 案(A)：体系確定まで `product_code` 省略 | **不承認** | 正式コードを今確定し、**`product_code` を必須**にする |
| 3 | 他システム商品を持たない | 承認 | 変更なし |
| 4 | `land_plot` の二段判定 | 承認 + **成功付与と表示しない** | §3.5 を追加 |
| 5 | 適用前に0件確認 | 承認 + **作成前と適用前の2回** | §6.2 |
| 6 | 判定は3段 | **6段へ変更** | `PRODUCT_CODE_REQUIRED` / `PRODUCT_TYPE_MISMATCH` を追加 |
| 7 | テスト11件 | 追加指定 | §5 に反映 |

**初版で私が推奨した案(A)は採りません。** 「体系が決まるまで `product_code` を省略」は所有者チェックを実質的に迂回する、というご指摘のとおりです。いま `entitlements` も許可済み送信元も0件で、稼働中の連携が無い以上、**緩い状態を一度も作らずに済む**のが最善です。

---

## 1. 確定した商品コード

| 商品コード | `entitlement_type` | 残高適用 |
|---|---|---|
| `SPPT_KOKUDAKA` | `kokudaka` | あり（`users.kokudaka`） |
| `SPPT_GACHA_TICKET` | `gacha_ticket` | あり（`users.gacha_tickets`） |
| `SPPT_LAND_PLOT` | `land_plot` | **なし**（`TYPE_NOT_APPLICABLE`） |

### 1.1 形式要件の実装解釈

ご指定の要件を、実装ではこう扱います。**この解釈のご確認をお願いします**（§7-1）。

| 要件 | 実装 |
|---|---|
| 大文字英数字とアンダースコアのみ | 上の3値との**完全一致のみ**を所有と判定。正規表現による事前検証は行わず、一致しなければ `PRODUCT_NOT_OWNED` |
| 前後空白を許可しない | **trim して救済しません。** `" SPPT_KOKUDAKA "` は `PRODUCT_NOT_OWNED` |
| 大文字小文字を自動変換しない | `"sppt_kokudaka"` は `PRODUCT_NOT_OWNED` |
| 別商品で再利用しない / 発行後に変更しない / 商品名変更でもコードを変更しない | コードに定数として固定し、構造テストで値の変更を検知します |

**空白のみの文字列（`"   "`）の扱い**：これは「コードを送っていない」と解釈し、`PRODUCT_CODE_REQUIRED` とします。空文字と同じ扱いです。

一見「前後空白を許可しない」と矛盾しますが、**空白の除去は「何も送られていないか」の判定にだけ使い、コードの照合には一切使いません**。`" SPPT_KOKUDAKA "` は中身があるので `PRODUCT_CODE_REQUIRED` にはならず、完全一致に失敗して `PRODUCT_NOT_OWNED` になります。

---

## 2. 判定順序

ご指定の6段をそのまま実装します。

| # | 判定 | 不成立時 |
|---|---|---|
| 1 | `source_system_key` が `entitlement_source_allowlist` にあるか | `SOURCE_NOT_ALLOWED` |
| 2 | `product_code` が実質的に存在するか（null / 空 / 空白のみ でない） | `PRODUCT_CODE_REQUIRED` |
| 3 | `product_code` が Passport 所有か（完全一致） | `PRODUCT_NOT_OWNED` |
| 4 | `product_code` と `entitlement_type` の組み合わせが一致するか | `PRODUCT_TYPE_MISMATCH` |
| 5 | 残高適用対象の種別か | `TYPE_NOT_APPLICABLE` |
| 6 | すべて通過 | `APPLIED` |

---

## 3. 設計

### 3.1 判定を1関数へ集約し直す

PR-P2a では `entitlement_balance_column()` と `entitlement_application_decision()` の**両方に送信元チェックが重複**していました。判定が2段のうちは許容できましたが、6段になると必ずずれます。

本PRで、判定の正本を `entitlement_application_decision()` 1本にします。

```
entitlement_application_decision(source, product_code, entitlement_type) → 判定結果
    ↑ 6段の順序はここにだけ存在する

entitlement_balance_column(source, product_code, entitlement_type) → 残高列 or null
    └ 上を呼び、'APPLIED' のときだけ entitlement_balance_column_for_type() の結果を返す
```

判定順序を書いた場所が1つになり、残高列の対応表も1つ（`entitlement_balance_column_for_type()`）のままです。

### 3.2 商品コードの対応表も1つ

```
entitlement_product_expected_type(product_code) → 期待される entitlement_type or null
```

この1関数で2つの問いに答えます。

- **所有しているか** → 戻り値が null でない
- **種別と一致するか** → 戻り値が `entitlement_type` と等しい

所有リストと対応表を別々に持つと、片方だけ直したときにずれます。

### 3.3 旧シグネチャは削除します

`entitlement_balance_column(text, text)` と `entitlement_application_decision(text, text)` は**引数が増える**ため、`create or replace` では**上書きされず多重定義（オーバーロード）になります**。緩い2引数版が残ると、うっかりそちらを呼んで商品コードチェックを迂回できてしまいます。

マイグレーションで**旧2引数版を明示的に `drop`** し、構造テストでそれを担保します。

### 3.4 取消側は今回も変更しません

PR-P2a で取消の判断根拠を「付与時に実際へ残高へ入れたか」（`entitlement_balance_was_applied()`）に変えたため、**判定条件を2段から6段に増やしても取消側は無変更で正しく動きます**。

ご指定の「取消時に現在の商品マップを再評価しない」は、この仕組みで既に満たされています。構造テストとDBテストの両方で明示的に確認します。

### 3.5 「成功付与と表示しない」への対応 ← 確認事項4後段

現在の実装には、ご指摘に該当する箇所が**2つ**あります。

#### (1) `balance_applied_at` が、残高が動いていなくても設定される

現在は非適用でも `balance_applied_at = now()` を入れています。列名に反する記録です。

**対応**：残高が実際に動いたときだけ設定します。**アプリケーションコードはこの列を一度も読んでいない**（`grep` で確認済み。設定しているのはマイグレーションのみ）ため、安全に変更できます。

#### (2) 再解決APIが、非適用のものを「解決済み」と数えている

`POST /api/admin/entitlements/retry-resolve` は `claim_outcome` が `claimed` なら `resolvedCount` に加算します。非適用でも `claimed` が返るため、**残高が入っていないものが「解決済み」として報告されます**。

**対応**：戻り値を分けます。

| 項目 | 意味 |
|---|---|
| `resolvedCount` | **実際に残高へ適用された**件数（`application_decision = 'APPLIED'`） |
| `notAppliedCount` | 処理は完了したが適用しなかった件数 |
| `notAppliedReasons` | 理由ごとの内訳 |

#### (3) `application_status` は変更しません

`application_status = 'applied'` は `claim_entitlement_application()` の `already_applied` ガードが依存しており、**無限再試行を防ぐ終端マーカー**として機能しています。ここを変えると再入判定が壊れます。

「処理が終わったか」を表す `application_status` と「残高へ入れたか」を表す `application_decision` を分ける、という PR-P2a の方針を維持します。**表示は必ず `application_decision` を根拠にします。**

#### (4) 参照用APIを追加します

PR-P2a の計画で「画面表示は PR-P2b 以降」としていた分です。「未知イベントは削除せず、受信記録と拒否理由を残す」というご指示は、**読める手段が無ければ意味を持ちません**。

`GET /api/admin/entitlements/not-applied`（読み取り専用）を追加し、`application_decision <> 'APPLIED'` の行を理由つきで返します。既存の `unresolved`（`user_id` 未解決のみ）では、`PRODUCT_NOT_OWNED` 等は `application_status = 'applied'` のため**一覧に出てきません**。

### 3.6 `application_decision` に3値を追加

`PRODUCT_CODE_REQUIRED` / `PRODUCT_NOT_OWNED` / `PRODUCT_TYPE_MISMATCH` を CHECK に追加します（既存5値 + 3 = 8値）。本番 `entitlements` は0件のため既存行の書き換えは発生しません。

### 3.7 `tenka_pass` / `castle_lord_plan` には触れません

ご判断のとおり、商品所有者マップへは追加しません。

**既存の購入処理・表示は一切変更しません。** これらは `purchases.item_type` を通る Stripe 購入の経路で、`entitlements` を通りません。本PRの変更範囲（`entitlements` の判定）とは交わらないため、影響がないことを非回帰テストで確認します。

将来イベント連携が必要になった時点で、正本システム・`product_code`・付与/取消処理を別途決定します。

---

## 4. 変更するもの

| # | ファイル | 内容 |
|---|---|---|
| 1 | `supabase/migrations/20260821000001_product_ownership.sql`（新規） | CHECK へ3値追加、`entitlement_product_expected_type()` 追加、旧2引数版の `drop`、3引数版の判定関数2つ、`process_entitlement_grant()` の `create or replace`（`balance_applied_at` の条件化を含む） |
| 2 | `src/modules/entitlements/domain/product-ownership.ts`（新規） | `PASSPORT_PRODUCT_CODES`、`expectedEntitlementTypeFor()`、`isProductCodeProvided()` |
| 3 | `src/modules/entitlements/domain/product-ownership.test.ts`（新規） | 単体テスト |
| 4 | `src/modules/entitlements/domain/allowlist.ts` | `decideEntitlementApplication()` を6段へ拡張 |
| 5 | `src/modules/entitlements/domain/allowlist.test.ts` | テスト追加 |
| 6 | `src/app/api/admin/entitlements/retry-resolve/route.ts` | 集計を `resolvedCount` / `notAppliedCount` に分離 |
| 7 | `src/app/api/admin/entitlements/not-applied/route.ts`（新規） | 読み取り専用の一覧 |
| 8 | `src/modules/entitlement-allowlist-guards.test.ts` | 構造テスト追加（§5.3） |
| 9 | `src/lib/expected-migrations.ts` | 1行追加 |
| 10 | `tests/integration/entitlement-concurrency.test.ts` | 統合テスト追加 |
| 11 | `tests/contracts/sen-no-kuni-hub-hmac.test.ts` | 正常系イベントに `product_code` を追加（必須化への追随） |

**変更しないもの**：`process_entitlement_revocation()`、`application_status` の CHECK、`entitlement_source_allowlist` の中身（空のまま）、既存の購入処理・表示、既存データ。

---

## 5. 検証

### 5.1 ご指定の必須テスト（確認事項7）

| # | 入力 | 期待 |
|---|---|---|
| 1 | `product_code` null | `PRODUCT_CODE_REQUIRED` |
| 2 | `product_code` 空文字 | `PRODUCT_CODE_REQUIRED` |
| 3 | 未知コード | `PRODUCT_NOT_OWNED` |
| 4 | `SPPT_KOKUDAKA` + `kokudaka` | `APPLIED` |
| 5 | `SPPT_GACHA_TICKET` + `gacha_ticket` | `APPLIED` |
| 6 | `SPPT_KOKUDAKA` + `gacha_ticket` | `PRODUCT_TYPE_MISMATCH` |
| 7 | `SPPT_LAND_PLOT` + `land_plot` | `TYPE_NOT_APPLICABLE` |
| 8 | `tenka_pass` | `PRODUCT_NOT_OWNED` |
| 9 | `castle_lord_plan` | `PRODUCT_NOT_OWNED` |
| 10 | 非適用 Entitlement を取消 | 残高が動かない |
| 11 | 取消時に現在の商品マップを再評価しない | 後から所有商品を変えても、入れていない残高を引かない |

### 5.2 追加で行う検証

| # | 入力 | 期待 |
|---|---|---|
| 12 | `product_code` 空白のみ（`"   "`） | `PRODUCT_CODE_REQUIRED` |
| 13 | `" SPPT_KOKUDAKA "`（前後空白） | `PRODUCT_NOT_OWNED`（trim で救済しない） |
| 14 | `"sppt_kokudaka"`（小文字） | `PRODUCT_NOT_OWNED`（自動変換しない） |
| 15 | 送信元が不許可 + 正しい商品コード | `SOURCE_NOT_ALLOWED`（商品を見る前に止まる） |
| 16 | 非適用時に `balance_applied_at` が NULL のまま | 残高が動いていないことが記録に残る |
| 17 | `APPLIED` 時のみ `balance_applied_at` が入る | — |
| 18 | 再解決APIが非適用を `resolvedCount` に数えない | `notAppliedCount` に入る |
| 19 | 空DBへ全87マイグレーションが適用でき、追加分の再実行が冪等 | — |
| 20 | PR-P2a の危険ケース4件（H / M / L / R）が同じ結果 | 非回帰 |
| 21 | `tenka_pass` / `castle_lord_plan` の購入処理が従来どおり | 非回帰 |

### 5.3 構造テスト

| # | 内容 |
|---|---|
| 22 | 判定順序が `entitlement_application_decision()` 1箇所にしかない |
| 23 | 旧2引数版の関数がマイグレーションで `drop` されている |
| 24 | 取消関数が `product_code` を参照していない |
| 25 | 商品コードの3値が SQL 側と TypeScript 側でずれていない |
| 26 | 他システムの商品名が判定に使われていない（コメント以外に現れない） |
| 27 | `entitlements` から `application_status` を読む表示系コードは `application_decision` も併せて読んでいる |

PR-P1b / P1c / PR5-a / P2a と同じく、**主要なテストは意図的に壊して落ちることを確認**してから提出します。

---

## 6. リスクと事前確認

### 6.1 挙動変更

**許可済み送信元は、`product_code` を必ず付ける必要があります。** 付けないと `PRODUCT_CODE_REQUIRED` で残高が入りません。

現時点で許可済み送信元は0件、`entitlements` も0件のため実害はありません。**新規に送信元を承認する際、契約文書で商品コードの送付を必須として合意していただく必要があります。**

### 6.2 `entitlements` 0件の確認（2回）

ご指示のとおり、**マイグレーション作成前**と**本番適用前**の両方で read-only 確認を行います。

0件でなかった場合の手順も、ご指示のとおりとします。

1. マイグレーション適用を停止する
2. 既存行の `product_code` / `entitlement_type` / `application_decision` を集計する
3. **自動更新しない**
4. 移行計画を別途提出する

### 6.3 ロールバック

| 手段 | 内容 |
|---|---|
| 第1 | 送信元へ正しい `product_code` を付けてもらう |
| 第2 | PR-P2a 版の関数群を `create or replace` で戻す（引数が異なるため、3引数版の `drop` も併せて必要） |
| データ | 追加した CHECK 値・定数は削除しない。既存データを一切変更しないため復旧不要 |

---

## 7. 確認をお願いしたい点

初版の5点はすべてご判断をいただきました。**本書で新たに確認をお願いしたいのは3点**です。

| # | 内容 |
|---|---|
| **1** | **§1.1 の形式要件の実装解釈。** 特に「空白のみの文字列は `PRODUCT_CODE_REQUIRED`、前後空白つきのコードは `PRODUCT_NOT_OWNED`」という切り分けでよいか |
| **2** | **§3.5 の「成功付与と表示しない」への対応4点。** 特に (1) `balance_applied_at` を残高が動いたときだけ設定する、(4) 参照用API を追加する、の2つは初版に無かった変更です |
| **3** | **§3.3 の旧2引数版関数の削除。** 引数が増えるため `create or replace` では上書きされず、緩い版が残ると迂回できてしまいます |

---

## 8. 作業範囲

本計画の承認までです。承認まで以下は行いません。

コード変更 / マイグレーション作成 / PR作成 / 本番設定変更 / 既存データの変更・削除
