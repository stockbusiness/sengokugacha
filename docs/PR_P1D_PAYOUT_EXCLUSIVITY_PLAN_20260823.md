# PR-P1d 実装計画 — 支払済み操作の排他と件数表示

- 作成日: 2026-08-23
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: 2026-08-22 のご判断 §10（支払済み操作の7項目確認）、`C3_PAYOUT_OPERATION_REVIEW_20260822.md`
- 起点: `main` = `51f23ec`
- **本計画の承認を受けるまで、コード変更・マイグレーション作成は行いません。**

---

## 1. 直すもの

C3 の確認で見つかった欠落2点と、注意点1点です。**新しい報酬を作成・計上する機能は追加しません。** いずれも既存の清算記録の正確さを守る変更です。

| # | 項目 | 現状 | 本PR |
|---|---|---|---|
| 1 | 二重実行防止 | 画面の連打は防げるが、**サーバー側に排他が無い** | DB関数で排他 |
| 2 | 対象件数の表示 | 金額のみ。**件数が出ていない** | 一覧と確認ダイアログに表示 |
| 3 | 監査ログの失敗 | 握り潰される（`console.error` のみ） | 応答に `auditLogged` を含める |

---

## 2. 何が起きうるのか

### 2.1 現在の処理

`POST /api/admin/payouts` は3手に分かれています。

```
1. commission_ledger から「確定済み・未払い」を SELECT
2. payouts へ INSERT（合計額つき）
3. 対象の commission_ledger を UPDATE（status=paid, payout_id）
```

この3手が**同一トランザクションでも排他でもない**ため、同一受取者への2リクエストが重なると次が起きます。

| 時刻 | A | B |
|---|---|---|
| 1 | 3件を SELECT | |
| 2 | | 同じ3件を SELECT |
| 3 | `payouts` へ INSERT | |
| 4 | | `payouts` へ INSERT |
| 5 | ledger を UPDATE | |
| 6 | | 同じ行を UPDATE（`payout_id` は後勝ち） |

結果、**`payouts` に同じ支払が2行でき、支払総額が二重計上されます**。`commission_ledger` は後勝ちで1つの payout にしか紐づかないため、**payouts の合計と ledger の合計が食い違います**。

実際の振込は画面外なので送金は二重になりませんが、**清算の記録が壊れます**。Passport は移管前報酬の清算専用なので、記録の正確さがこの画面の存在意義そのものです。

### 2.2 いま起きていないのはなぜか

`commission_ledger` が**0件**だからです。対象0件なら 400 で止まるため、現時点で踏む経路がありません。

**壊れる対象が存在しないうちに直せる**のが今です。清算が始まってから記録が食い違うと、どちらが正しいかを事後に判定する作業が発生します。

---

## 3. 設計

### 3.1 排他は claim/fencing ではなくトランザクション内の行ロックで足りる

本リポジトリには `purchase_grant_steps` や `integration_outbox_events` で使っている claim/fencing（リース＋トークン）の仕組みがあります。**今回はこれを使いません。**

claim/fencing は「複数のワーカーが長時間かかる処理を分担し、途中で落ちても再開できる」ための道具です。支払記録は**一瞬で終わる同期処理**で、途中経過を持ちません。この場合はトランザクション内で対象行をロックするだけで十分で、リースの期限切れやトークンの管理といった余計な状態を持たずに済みます。

### 3.2 DB関数へ移す

```
create function create_payout_for_recipient(
  p_recipient_type text,
  p_recipient_user_id uuid,
  p_recipient_agent_id uuid,
  p_created_by text
) returns table (payout_id uuid, line_count int, total_amount_yen bigint, outcome text)
```

処理は1トランザクション内で完結します。

1. 対象の `commission_ledger` を **`for update`** で取得する（`status='confirmed'` かつ `payout_id is null`）
2. 0件なら `outcome := 'no_target'` を返して終わる（例外にしない。呼び出し側が 400 を返す）
3. `payouts` へ INSERT
4. 対象行を UPDATE

**`for update` が要点です。** A が行をロックしている間、B は 1 で待たされます。A がコミットすると B の SELECT は `payout_id is null` の条件を再評価して0件になり、`no_target` を返します。**payouts が2行できることはありません。**

### 3.3 件数を返す

DB関数が `line_count` を返すため、API 応答にそのまま含められます。一覧側も受取者ごとの件数を返すようにします。

### 3.4 監査ログの失敗を可視化する

`logAdminAction()` はすべての例外を握り潰します。これは C6 の調査で私が判断を誤った原因でもありました（「記録が無い＝処理が走っていない」と考えましたが、記録が落ちただけの可能性を排除できていませんでした）。

**`logAdminAction()` 自体の挙動は変えません。** 全呼び出し箇所の失敗時挙動が変わってしまい、影響範囲が読めなくなるためです。

代わりに、成否を返す薄い関数を1つ足し、支払APIだけがそれを使います。

```ts
// 監査ログを書き、成否を返す。既存の logAdminAction() は挙動を変えない。
export async function logAdminActionWithResult(...): Promise<boolean>
```

応答は `{ ..., auditLogged: false }` となり、画面は「支払は記録されましたが、監査ログの記録に失敗しました」と表示します。

**「監査ログが書けないと支払記録も失敗する」設計にはしません。** 逆に業務が止まります。

---

## 4. 変更するもの

| # | ファイル | 内容 |
|---|---|---|
| 1 | `supabase/migrations/20260822000001_payout_exclusivity.sql`（新規） | `create_payout_for_recipient()` の追加 |
| 2 | `src/app/api/admin/payouts/route.ts` | POST を DB関数の呼び出しに置き換え、`lineCount` / `auditLogged` を返す |
| 3 | `src/app/api/admin/commission-ledger/recipients/route.ts` | 受取者一覧に件数を追加（※現在の実装を確認のうえ確定） |
| 4 | `src/lib/admin-audit-log.ts` | `logAdminActionWithResult()` を追加（既存関数は変更しない） |
| 5 | `src/app/admin/(dashboard)/castle-payouts/page.tsx` | 一覧と確認ダイアログに件数、監査ログ失敗の表示 |
| 6 | `src/modules/castle/domain/payout-confirmation.ts`（新規） | 確認ダイアログの文言を組み立てる純関数 |
| 7 | `src/modules/castle/domain/payout-confirmation.test.ts`（新規） | 単体テスト |
| 8 | `src/modules/commission-write-guards.test.ts` | 構造テスト追加 |
| 9 | `src/lib/expected-migrations.ts` | 1行追加 |
| 10 | `tests/integration/payout-concurrency.test.ts`（新規） | 並行実行の統合テスト |

**変更しないもの**：`logAdminAction()` の挙動、報酬の作成・計上、確定処理、`payouts` / `commission_ledger` のスキーマ、既存データ。

---

## 5. 検証

### 5.1 単体テスト

| # | 内容 |
|---|---|
| 1 | 確認ダイアログの文言に受取者名・件数・金額が入る |
| 2 | 件数が0のときは確認へ進まない |
| 3 | 監査ログ失敗時の文言 |

### 5.2 ローカル PostgreSQL 16（実DB）

| # | 内容 |
|---|---|
| 4 | 空DBへ全88マイグレーションが適用でき、追加分の再実行が冪等 |
| 5 | 対象3件で1回呼ぶと `payouts` 1行、`line_count=3`、合計額が一致 |
| 6 | **同一受取者へ10並列で呼ぶと `payouts` は1行だけ**（本PRの要） |
| 7 | 同上で `commission_ledger` の `payout_id` がすべて同じ1件を指す |
| 8 | 同上で payouts の合計と ledger の合計が一致する |
| 9 | 対象0件なら `no_target` を返し、`payouts` に行を作らない |
| 10 | 異なる受取者への並行実行は互いにブロックしない（受取者単位の排他であること） |
| 11 | `status='paid'` の行と `payout_id` が入った行を再処理しない |
| 12 | 途中で失敗した場合、`payouts` の行も残らない（トランザクション性） |

### 5.3 構造テスト

| # | 内容 |
|---|---|
| 13 | 支払APIが `payouts` へ直接 INSERT していない（DB関数経由であること） |
| 14 | 支払APIが `commission_ledger` へ直接 UPDATE していない |
| 15 | 新しい報酬を作成・加算するコードが増えていない |
| 16 | `logAdminAction()` の挙動が変わっていない |

**主要なテストは意図的に壊して落ちることを確認**してから提出します。特に 6 は、`for update` を外した状態で落ちることを確認します。

---

## 6. リスク

### 6.1 挙動変更

| 変更 | 影響 |
|---|---|
| 対象0件のときの応答 | 現在も 400。**変わりません** |
| 同時実行時の2件目 | 現在は2行できる → **`no_target` で 400**。正しい挙動へ変わります |
| 応答に `lineCount` / `auditLogged` が増える | 追加のみ。既存フィールドは変えません |

`commission_ledger` が0件のため、**現時点で実害のある変更はありません**。

### 6.2 ロールバック

| 手段 | 内容 |
|---|---|
| 第1 | コードを revert する（DB関数は残っても呼ばれなくなるだけ） |
| 第2 | 必要なら `drop function create_payout_for_recipient(...)` |
| データ | 既存データを一切変更しないため復旧不要 |

---

## 7. 確認をお願いしたい点

| # | 内容 |
|---|---|
| 1 | **排他に claim/fencing を使わず、トランザクション内の `for update` にすること**（§3.1）。支払記録は一瞬で終わる同期処理で途中経過を持たないため |
| 2 | **同時実行の2件目が 400「対象の確定済み報酬がありません」になること**。1件目は成功しているので実務上は正しい結果ですが、操作者には「失敗した」ように見えます。文言を変えるべきかご判断ください |
| 3 | **`logAdminAction()` 自体は変更せず、支払APIだけが成否を返す関数を使うこと**（§3.4） |
| 4 | 監査ログ失敗時も**支払記録は成功させる**こと（止めると業務が止まるため） |

---

## 8. 作業範囲

本計画の承認までです。承認まで以下は行いません。

コード変更 / マイグレーション作成 / PR作成 / 本番設定変更 / 既存データの変更・削除
