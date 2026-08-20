# PR-P1a 実装計画 — 旧コミッション新規計上の停止

- 作成日: 2026-08-20
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: `01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` PR-P1 / Q2 回答（案 d・第1段階のみ）/ Q4 回答
- 起点: `main` = `9ee47fb`
- 本計画の承認を受けるまで、コード変更は開始しません。

## 1. スコープ

Q2 のご指示は二段階停止でしたが、`commission_ledger` が**本番0件**であることが判明したため、**第1段階のみを実装**します（承認済み）。実行ルール §4「1つのPRに異なる目的を混在させない」に従い、3つに分けます。

| PR | 目的 | 本計画の対象 |
|---|---|---|
| **PR-P1a** | 新規計上の**停止** | ✅ 本計画 |
| PR-P1b | 管理画面の**運用表示**（清算専用化） | 次PR |
| PR-P1c | 販売成果Outbox（**契約追加**、Q3 案b） | その次 |

### 第1段階で停止するもの（Q2 ご指示より）

| 対象 | 実装 |
|---|---|
| `postLandSaleCommission()` による `commission_ledger` の新規作成 | フラグでガード |
| 新規販売に対する Passport 内報酬計算（`commission_rule_sets` の作成・更新・削除・公開） | フラグでガード（②承認済み） |
| 新規販売に対する Passport 内 payout 対象化 | 上記の帰結として自動的に達成（§4.5） |

### 第1段階で停止しないもの（Q2 ご指示より）

既存分の清算のため、以下は従来どおり動作させます。

- 既存 commission の `confirmed` への遷移（`confirmMaturedCommissions()`）
- 既存 commission の返金取消（`applyRefundAdjustments()`）
- 既存 commission の支払処理と、既存分に必要な payout 作成（`POST /api/admin/payouts`）

### 保留するもの（承認済み）

第2段階（confirm / adjustment / payout の書込み停止）と、移行基準日時による分岐は**実装しません**。既存 commission が0件では「基準日時より前の行だけ状態遷移を許す」条件を実データで検証できず、**動作未確認のコードが安全装置として残る**ためです。清算対象が実際に生まれた時点で、実データとともに実装します。

## 2. 現状の書込み経路（確定版）

| # | 経路 | 実装 | 起点 | 本PRでの扱い |
|---|---|---|---|---|
| 1 | `postLandSaleCommission()` | `src/lib/castle-commissions.ts:23`（insert は `:105`） | Stripe 決済確定 → `runPurchaseGrant()` の `commission_posted` ステップ（`run-purchase-grant.ts:199`） | **停止** |
| 2 | rule set 作成 | `POST /api/admin/commission-rule-sets` | 管理者 | **停止** |
| 3 | rule set 更新 | `PATCH /api/admin/commission-rule-sets/[id]` | 管理者 | **停止** |
| 4 | rule set 削除 | `DELETE /api/admin/commission-rule-sets/[id]` | 管理者 | **停止** |
| 5 | rule set 公開 | `POST /api/admin/commission-rule-sets/[id]/publish` | 管理者 | **停止** |
| 6 | `confirmMaturedCommissions()` | `castle-commissions.ts:112` | 管理者 | 継続 |
| 7 | `applyRefundAdjustments()` | `castle-commissions.ts:146` | 管理者の返金操作 | 継続 |
| 8 | payout 作成＋台帳の `paid` 化 | `POST /api/admin/payouts` | 管理者 | 継続 |

読み取り専用（ガード不要）: `src/lib/castle-kpi.ts`、`GET /api/admin/commission-ledger`、`/payable-recipients`、`src/lib/commission-rule-sets.ts` の参照系。

### 2.1 `agent_sales` は本PRの対象外（Q4 ご指示より）

Q4 のご指示は「当面は販売実績のローカル監査記録として継続可能。Agency 向け販売成果イベントの送信が安定した後、新規書込みを停止する」でした。**PR-P1c（販売成果Outbox）が安定した後の別作業**とし、本PRでは触りません。国高・ガチャチケットの購入処理も停止しません。

### 2.2 `commission_adjustments` は本PRの対象外（Q4 ご指示より）

「移行基準日時より前に作成された既存 commission の返金取消に限り使用可能」というご指示ですが、既存 commission が0件のため、返金取消の呼び出し自体が発生しません。経路7を継続扱いにすることで結果的に条件を満たします。**第2段階で停止**します。

## 3. 設計

### 3.1 停止フラグの置き場所

既存の設定機構に合わせ、**新規テーブル `commission_write_settings`** を1本追加します。

```sql
create table commission_write_settings (
  id uuid primary key default gen_random_uuid(),
  -- Agencyへ移管済み。既定は「停止」。
  land_sale_commission_write_enabled boolean not null default false,
  commission_rule_set_write_enabled  boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table commission_write_settings enable row level security;
```

**既存テーブルへ列を足すのではなく新規テーブルにする理由**: 最も近い既存テーブルは `castle_lord_plan_settings` ですが、これは城主プランの価格・容量・猶予日数という**事業パラメータ**の置き場です。「Agency へ移管したので書込みを止める」というのは事業パラメータではなく**移管の状態**で、寿命も撤去のタイミングも異なります。混ぜると、将来この停止を解除・撤去するときに城主プラン設定へ手を入れることになります。

**行を1件も入れません。** `payment_settings` / `learning_journey_settings` と同じシングルトン運用で、行が無い場合はコード側の既定値（両方 `false` = 停止）を返します。これにより**マイグレーションを適用しただけで停止が有効**になり、設定行の投入忘れが「意図せず書込みが開く」方向に働きません。

### 3.2 判定は純粋関数に置く

`src/modules/castle/domain/commission-write-policy.ts`（新規）

```
export type CommissionWriteTarget = "land_sale_commission" | "commission_rule_set";

export type CommissionWriteDecision =
  | { allowed: true }
  | { allowed: false; code: "commission_write_disabled"; message: string };

export function decideCommissionWrite(
  target: CommissionWriteTarget,
  settings: { landSaleCommissionWriteEnabled: boolean; commissionRuleSetWriteEnabled: boolean }
): CommissionWriteDecision
```

判定・エラーコード・利用者向け文言をこの1箇所に集約し、vitest で全組み合わせを検証します。アーキテクチャCIの制約により、この層は Supabase / Next.js に依存しません。

### 3.3 サービス層ガード

`src/lib/commission-write-settings.ts`（新規）が設定テーブルを読み、`decideCommissionWrite()` を呼びます。各書込み入口はこれを最初に通します。

### 3.4 購入処理を失敗させない（最重要）

実行ルール §4「同期API失敗で購入や返金を失敗させない」に従い、**停止は「成功扱いのスキップ」**として実装します。

`postLandSaleCommission()` の先頭で判定し、停止中なら**例外を投げずに早期 return** します。

```ts
export async function postLandSaleCommission(purchaseId: string): Promise<void> {
  const decision = await decideLandSaleCommissionWrite();
  if (!decision.allowed) {
    console.info("報酬計上はAgencyへ移管済みのため、新規計上をスキップしました", { purchaseId });
    return;
  }
  // …既存処理…
}
```

**この形が既存の挙動と一致します。** 同関数には既に「公開済みルールセットが無い場合はログを出して return」という早期 return があり（`castle-commissions.ts:43`）、`runStep()` はこれを成功として `commission_posted` を completed にします。停止も同じ扱いにすることで、**土地購入は従来どおり完了し、区画の所有権確定も LINE 通知も走ります**。

> ここを例外にすると `runStep()` が `markStepFailed()` を呼び、`runPurchaseGrant()` 全体が失敗して `purchases.status` が `grant_failed` になります。**利用者は決済済みなのに区画を受け取れません。** 停止フラグが購入を壊す、という最悪の形なので、ここは明確に成功扱いにします。

### 3.5 API のエラーコード

指示書「APIは削除せず、書込み要求に機械判定可能なエラーコードを返す」に対応します。rule set 系4ルートは **HTTP 409** で次を返します。

```json
{
  "error": "報酬ルールの編集はAgencyへ移管済みです。新規計上は停止中です。",
  "code": "commission_write_disabled"
}
```

**`error` を文字列のまま残す理由**: 管理画面は `data.error` を文字列として読み、そのまま画面に出す作りです（`castle-commission-rules/page.tsx:132` ほか）。`{ error: { code, message } }` という入れ子に変えると、既存画面が `[object Object]` を表示します。文字列の `error` を維持したまま `code` を**併記**することで、機械判定と既存UIの両立ができます。

APIルートは削除せず、GET（参照）も従来どおり動きます。

## 4. 変更予定ファイル

| # | ファイル | 変更 |
|---|---|---|
| 1 | `supabase/migrations/20260817000001_commission_write_settings.sql` | **新規**。テーブル1本（追加のみ） |
| 2 | `src/lib/expected-migrations.ts` | version を1行追加（CIが漏れを検知します） |
| 3 | `src/modules/castle/domain/commission-write-policy.ts` | **新規**。純粋関数 |
| 4 | `src/modules/castle/domain/commission-write-policy.test.ts` | **新規** |
| 5 | `src/lib/commission-write-settings.ts` | **新規**。設定読み取り＋判定 |
| 6 | `src/lib/castle-commissions.ts` | `postLandSaleCommission()` の先頭にガード（早期 return） |
| 7 | `src/app/api/admin/commission-rule-sets/route.ts` | POST にガード |
| 8 | `src/app/api/admin/commission-rule-sets/[id]/route.ts` | PATCH / DELETE にガード |
| 9 | `src/app/api/admin/commission-rule-sets/[id]/publish/route.ts` | POST にガード |
| 10 | `src/modules/commerce/application/run-purchase-grant.test.ts` | 停止中でも購入が完了することのテストを追加 |

**既存テーブル・列・履歴の削除や変更はありません。**

## 5. DB変更

追加型のみ。テーブル1本、既存データへの影響なし。行は投入しません（§3.1）。

マージ後、PR #164 で入った検知機構により、staging / production への適用漏れは `/admin/operations-health` が名指しで警告します。

## 6. テスト項目

### 6.1 純粋関数（vitest）

| # | 内容 |
|---|---|
| 1 | 両フラグ false → 両対象とも `allowed: false`、コードは `commission_write_disabled` |
| 2 | `landSaleCommissionWriteEnabled: true` → 土地報酬のみ許可、rule set は不許可 |
| 3 | `commissionRuleSetWriteEnabled: true` → rule set のみ許可 |
| 4 | 両方 true → 両方許可（従来挙動） |
| 5 | 設定行が無いときの既定値が「両方停止」 |

### 6.2 購入処理の非回帰（指示書「フラグ停止中の…バッチ処理」）

| # | 内容 |
|---|---|
| 6 | **停止中に土地購入が完走し、`purchases.status` が `completed` になる** |
| 7 | 停止中でも `plot_completed`（区画確定）と `notification_sent`（通知）が実行される |
| 8 | 停止中に `commission_ledger` へ1行も挿入されない |
| 9 | `commission_posted` ステップが failed にならず completed になる |
| 10 | 許可時は従来どおり計上される |

6〜10 は既存の `run-purchase-grant.test.ts` の枠組み（`vi.mock` で `castle-commissions` を差し替える形）に追加します。

### 6.3 API（指示書「フラグ停止中の各書込みAPI」）

| # | 内容 |
|---|---|
| 11 | 停止中の POST / PATCH / DELETE / publish が 409 と `code: "commission_write_disabled"` を返す |
| 12 | 停止中でも GET（参照）は従来どおり成功する |
| 13 | 認証チェックがガードより先に働く（未認証は 401 のまま。停止理由を未認証者に漏らさない） |

### 6.4 非回帰（指示書「既存履歴参照、CSV出力、集計値の非回帰」）

| # | 内容 |
|---|---|
| 14 | `test:unit` 460件、`test:architecture` 64件、`tsc`、`lint`、`build` が通る |
| 15 | 既存の commission 参照系・KPI集計・CSV出力に変更が無いこと（コード差分が無いことで担保） |

### 6.5 ローカル PostgreSQL 16 での適用確認

| # | 内容 |
|---|---|
| 16 | 空DBへ全83マイグレーションが順に適用できる |
| 17 | 追加マイグレーションの再実行が冪等 |

### 6.6 このPRで実施しないテスト

指示書のテスト項目「**フラグ切替の境界時刻と並行リクエスト**」は、移行基準日時を実装しないため該当しません（第2段階へ繰り延べ）。フラグは単純な boolean で、切替時刻による分岐を持ちません。

## 7. 影響範囲

| 領域 | 影響 |
|---|---|
| 利用者（本番19名） | **なし。** 土地販売は未稼働（Stripe 未設定・城0件・区画0件）で、購入導線に到達できません |
| 管理者 | 報酬ルールの作成・編集・削除・公開ができなくなります。**現在 `commission_rule_sets` は0件**のため、失われる運用はありません |
| 既存データ | **変更なし。** 全対象テーブルが0件で、保持すべき履歴が存在しません |
| 他システム | なし |

**このPRは実質的に「これから起きることを止める」だけで、いま動いているものを止めません。** 本番の稼働状況（購入0件・報酬0件・ルール0件・Stripe未設定）がそれを裏づけています。

## 8. ロールバック

| 項目 | 内容 |
|---|---|
| **条件** | 土地購入が完了しなくなった場合、または管理業務が停止した場合 |
| **第1手段** | **フラグを ON にする**。SQL 1文で従来挙動へ完全復帰します（指示書「コードを戻す前に機能フラグで新ガードを停止する」に準拠） |
| **第2手段** | コードの revert |
| **データ復旧** | 不要。既存データを一切変更しません |
| **追加テーブル** | 削除しません（指示書のロールバック方針）。旧書込みの再開には責任者の明示承認を必須とします |

復帰用SQL（**承認前は実行しないでください**）:

```sql
insert into commission_write_settings
  (land_sale_commission_write_enabled, commission_rule_set_write_enabled)
values (true, true);
```

## 9. 受入条件との対応

| 指示書の受入条件 | 満たし方 |
|---|---|
| 停止フラグがデフォルトOFF（書込み不可）で、新規 commission ledger と payout が作成されない | 設定行を作らず、コード既定値を両方 `false` に（§3.1）。payout は新規台帳が生まれないため対象が発生しない（§4.5） |
| 既存報酬・支払履歴は従来どおり参照できる | 参照系に一切手を入れない |
| 許可済みゲーム Entitlement は従来どおり1回だけ適用される | 本PRは entitlement 経路に触れない |
| Passport 内部ポイントが OVE と表示されない | PR-P3 で達成済み |

## 10. 確認をお願いしたい点

| # | 内容 |
|---|---|
| 1 | 新規テーブル `commission_write_settings` を追加する方針（既存テーブルへの列追加ではなく、§3.1 の理由） |
| 2 | フラグを2つに分ける方針（土地報酬 / rule set）。1つにまとめる場合はご指示ください |
| 3 | **停止を「成功扱いのスキップ」にすること**（§3.4）。例外にすると購入自体が失敗します |
| 4 | エラー応答で `error`（文字列）を維持し `code` を併記する方針（§3.5。既存管理画面を壊さないため） |
| 5 | 第2段階・移行基準日時・清算専用UIを本PRに含めないこと（承認済みの再確認） |
