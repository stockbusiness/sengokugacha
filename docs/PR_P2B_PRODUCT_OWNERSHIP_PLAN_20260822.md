# PR-P2b 実装計画 — 商品所有者マップ

- 作成日: 2026-08-22
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: `01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` PR-P2、**Q5（案b）・Q6（案d ＋ 商品コード条件）** の回答
- 起点: `main` = `d283ea6`（PR-P2a マージ済み）
- **本計画の承認を受けるまで、コード変更・マイグレーション作成は行いません。**

---

## 1. このPRの位置づけ

PR-P2a で「送信元 × 権利種別」の allowlist を入れました。本PRは Q6 の**残り半分**を実装します。

> さらにイベントに商品コードが含まれる場合は、商品コードも一致条件へ追加してください。（Q6 回答）

| 指示書 PR-P2 の要求 | 状態 |
|---|---|
| 適用できる権利種別を明示的な allowlist にする | ✅ PR-P2a |
| 送信元も一致条件にする | ✅ PR-P2a |
| 非適用理由を記録する | ✅ PR-P2a |
| **商品所有者マップをコードまたは設定に置く** | 本PR |
| **商品コードを一致条件へ追加する** | 本PR |

### 事前調査の結果、当初想定と1点変わります

5システム版調査書では PR-P2b を「**判定に使うだけで、既存処理の分岐は変えない**設計」と書きました。Q6 の回答で商品コードが一致条件に加わったため、**判定そのものが変わります**。調査書のこの記述は本計画で上書きします。

---

## 2. 現状の実測

### 2.1 `product_code` は保存されているが、一度も読まれていない

| 箇所 | 内容 |
|---|---|
| `entitlements.product_code` | 列は存在する（nullable、CHECK なし） |
| `grant-entitlement.ts:30` | イベント本文の `product_code` をそのまま保存している |
| `supabase-entitlement-repository.ts:51` | INSERT している |
| **判定での使用** | **どこにも無い**。`process_entitlement_grant()` は `product_code` を参照しない |

つまり「商品コードは受け取って記録しているが、何の判断にも使っていない」状態です。ここが Q6 の求める穴です。

### 2.2 Passport が実際に扱っている商品識別子

| テーブル / 列 | 値 |
|---|---|
| `purchases.item_type` | `kokudaka` / `gacha_ticket` / **`tenka_pass`** / `land_plot` / **`castle_lord_plan`** |
| `external_order_items.product_type` | `land_plot` のみ |
| `entitlements.entitlement_type` | 自由文字列（既定 `generic`） |
| `sales_fact_outbox_events.product_code` | `purchases.item_type` の値をそのまま入れている |

**Q5 でご提示いただいた Passport の担当は3つ**（`kokudaka` / `gacha_ticket` / `land_plot`）ですが、**実在するのは5つ**です。`tenka_pass`（天下統一パス）と `castle_lord_plan`（城主プラン）が一覧に含まれていません。→ 確認事項1

### 2.3 現在の露出はゼロのまま

| 項目 | 実測 |
|---|---|
| `entitlements` | 0件 |
| `entitlement_source_allowlist` | 0件（PR-P2a で追加、空で出荷） |
| `sen_no_kuni_hub_settings` | 0行（どのシステムも認証を通せない） |

本PRも「これから起きることを止める」もので、いま動いているものを止めません。

---

## 3. 設計

### 3.1 商品所有者マップはどこに置くか

Q5 は案(b)、すなわち「**5システム共通の商品台帳DBは作らない。各システムが自分の担当商品をローカル設定で管理する**」でした。併せて「**Passportを全システムの商品台帳の正本にはしません**」とのご指示です。

これを素直に実装すると、Passport が持つべきものは1つだけです。

| 持つもの | 置き場所 | 理由 |
|---|---|---|
| **Passport が担当する商品識別子** | **コード**（定数） | `purchases.item_type` の CHECK と1対1で対応する。増やすには結局コードとDBの変更が要る |
| 他システムの担当商品 | **持たない** | 持つと事実上の正本になり、Q5 のご指示に反する |

他システムの担当（評議員権・会員権・クリエイター作品など）は、**拒否理由の文言を分かりやすくするためだけ**にコード内のコメントとして残し、判定にも画面表示にも使いません。→ 確認事項3

**PR-P2a との対比**：あちらは `source_system_key` を運用で足せるようテーブルにしました。こちらは Passport 自身の商品なので、運用で増えるものではなくコードに固定します。

### 3.2 判定への追加

PR-P2a で作った判定関数に、商品コードの条件を1段足します。

```
1. source_system_key が entitlement_source_allowlist にあるか  → 無ければ SOURCE_NOT_ALLOWED
2. product_code が非NULLなら、Passport の担当商品か          → 違えば PRODUCT_NOT_OWNED   ← 本PRで追加
3. entitlement_type が kokudaka / gacha_ticket か             → 違えば TYPE_NOT_APPLICABLE
4. すべて一致 → APPLIED
```

**`product_code` が NULL の場合は従来どおり**（1→3→4）です。Q6 が「イベントに商品コードが**含まれる場合は**」と条件付きで書かれているためです。

順序を2番に置くのは、送信元が許可済みでも「よその商品」なら種別を見るまでもないからです。

### 3.3 取消側は触りません

PR-P2a で、取消は allowlist を再評価せず `application_decision` だけを見る設計に変えました。**そのおかげで本PRは取消側を一切変更する必要がありません。**

判定条件を1つ増やしても、「付与時に実際へ入れたか」という取消側の根拠は変わらないためです。もし PR-P2a の当初設計（取消も同じ判定関数を呼ぶ）のままだったら、本PRでも「商品コードの解釈が変わると、入れていない残高を引く」という同じ穴を作り直すところでした。

### 3.4 `application_decision` への値追加

`PRODUCT_NOT_OWNED` を CHECK に足します。PR-P2a で入れたばかりの列で、**本番は0件**のため、既存行の書き換えは発生しません。

`application_status` は今回も変更しません。

---

## 4. 変更するもの

| # | ファイル | 内容 |
|---|---|---|
| 1 | `supabase/migrations/20260821000001_product_ownership.sql`（新規） | `application_decision` CHECK へ `PRODUCT_NOT_OWNED` 追加、判定関数2つに `p_product_code` 引数を追加、`process_entitlement_grant()` の `create or replace` |
| 2 | `src/modules/entitlements/domain/product-ownership.ts`（新規） | `PASSPORT_OWNED_PRODUCT_CODES`、`isPassportOwnedProduct()`、他システム担当のコメント |
| 3 | `src/modules/entitlements/domain/product-ownership.test.ts`（新規） | 単体テスト |
| 4 | `src/modules/entitlements/domain/allowlist.ts` | `decideEntitlementApplication()` に商品コード条件を追加 |
| 5 | `src/modules/entitlements/domain/allowlist.test.ts` | 上記のテスト追加 |
| 6 | `src/modules/entitlement-allowlist-guards.test.ts` | 構造テストを追加（下記 §5.3） |
| 7 | `src/lib/expected-migrations.ts` | 1行追加 |
| 8 | `tests/integration/entitlement-concurrency.test.ts` | 商品コード条件の統合テストを追加 |

**変更しないもの**：`process_entitlement_revocation()`、`application_status`、既存データ、`entitlement_source_allowlist` の中身（空のまま）。

---

## 5. 検証

### 5.1 単体・構造テスト

| # | 内容 |
|---|---|
| 1 | `product_code` が NULL なら従来どおり判定される |
| 2 | Passport 担当の商品コードなら適用される |
| 3 | よその商品コードなら `PRODUCT_NOT_OWNED` |
| 4 | 送信元が不許可なら、商品コードを見る前に `SOURCE_NOT_ALLOWED` |
| 5 | 商品コードが担当でも、種別が対象外なら `TYPE_NOT_APPLICABLE` |

### 5.2 ローカル PostgreSQL 16（実DB）

| # | 内容 |
|---|---|
| 6 | 空DBへ全87マイグレーションが適用でき、追加分の再実行が冪等 |
| 7 | 許可済み送信元 + `kokudaka` + よその商品コード → **残高が動かない** |
| 8 | 許可済み送信元 + `kokudaka` + `product_code` NULL → 適用される（非回帰） |
| 9 | **`PRODUCT_NOT_OWNED` で拒否した権利は、取消でも残高を動かさない** |
| 10 | PR-P2a の危険ケース4件（H / M / L / R）が引き続き同じ結果になる |

### 5.3 構造テスト

| # | 内容 |
|---|---|
| 11 | 担当商品の一覧が SQL 側と TypeScript 側でずれていない |
| 12 | 取消関数が `product_code` を参照していない |
| 13 | 他システムの担当商品が判定に使われていない（コメント以外に現れない） |

PR-P1b / P1c / PR5-a / P2a と同じく、**主要なテストは意図的に壊して落ちることを確認**してから提出します。

---

## 6. 挙動変更とリスク

### 6.1 商品コードの体系がまだ決まっていません

**ここが本PR最大の未確定点です。**

Q5 は「各システムの識別子と担当商品を、共通のシステム登録表・契約文書で管理してください」とのご指示ですが、**その登録表はまだ存在しません**。

そのため、承認済みのゲーム送信元が独自の商品コード（例：`KOKU-100`）を付けて `entitlement_type=kokudaka` を送ってきた場合、Passport はそれを「よその商品」と見なして `PRODUCT_NOT_OWNED` で止めます。**送信側から見ると、正しい種別を送っているのに残高が入らない**ことになります。

| 案 | 内容 | 評価 |
|---|---|---|
| **(A)** | 担当商品コードを `kokudaka` / `gacha_ticket` / `land_plot` に固定し、それ以外は拒否 | 安全側。ただし商品コード体系が決まるまで、送信元は `product_code` を**省略する**必要がある |
| (B) | 送信元ごとに許可する商品コードを登録できるテーブルを作る | 柔軟。ただし PR-P2a の allowlist と二重管理になり、運用が複雑になる |
| (C) | 商品コードが未知でも警告記録だけ残して適用する | Q6 のご指示（一致条件へ追加）に反する |

**(A) を推奨します。** 現時点で送信元は0件、`entitlements` も0件のため実害がなく、商品コード体系が決まった時点で (B) へ広げるのは容易です。逆順（緩く出して後から締める）はできません。

送信元への周知事項として「**商品コード体系が確定するまで `product_code` は省略してください**」を契約文書へ加えていただく必要があります。→ 確認事項2

### 6.2 ロールバック

| 手段 | 内容 |
|---|---|
| 第1 | 送信元に `product_code` を省略してもらう（＝従来の挙動に戻る） |
| 第2 | PR-P2a 版の `process_entitlement_grant()` を `create or replace` で戻す |
| データ | 追加した CHECK 値・定数は削除しない。既存データを一切変更しないため復旧不要 |

---

## 7. 確認をお願いしたい点

| # | 内容 |
|---|---|
| **1** | **`tenka_pass`（天下統一パス）と `castle_lord_plan`（城主プラン）の扱い。** Q5 の Passport 担当一覧は3つですが、`purchases.item_type` には5つ実在します。この2つも Passport の担当として担当商品コードに含めてよいか（含めないと、将来これらの権利をイベント経由で扱う際に拒否されます） |
| **2** | **§6.1 の案(A)** を採ること。併せて「商品コード体系が確定するまで `product_code` は省略」を送信元への周知事項に加えていただくこと |
| **3** | **他システムの担当商品を Passport 側に持たないこと**（コード内のコメントのみとし、テーブルにも判定にも使わない）。Q5 の「Passport を正本にしない」に沿った解釈で問題ないか |
| **4** | `land_plot` は Passport の担当商品ですが**残高種別ではない**ため、`product_code=land_plot` かつ `entitlement_type=land_plot` のイベントは商品コード条件は通り、種別条件で `TYPE_NOT_APPLICABLE` になります。この二段の結果でよいか |
| 5 | マイグレーション作成前に、`entitlements` が引き続き0件であることを read-only で再確認すること |

---

## 8. 作業範囲

本計画の提出までです。承認まで以下は行いません。

コード変更 / マイグレーション作成 / PR作成 / 本番設定変更 / 既存データの変更・削除
