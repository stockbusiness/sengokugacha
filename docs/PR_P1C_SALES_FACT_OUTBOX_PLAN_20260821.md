# PR-P1c 実装計画 — 販売成果Outbox

- 作成日: 2026-08-21
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: Q3 回答（案b）、C1 回答の修正指示1〜8
- 起点: `main` = `792f2bd`
- **本計画の承認を受けるまで、コード変更・マイグレーション作成・PR作成は行いません。**

## 0. 冒頭に訂正

私が「20項目」と書いていましたが、**ご指定の項目は21項目**でした。数え間違いです。以下は21項目を正として、修正指示3で追加された5項目、および冪等性・監査に必要な項目を加えた一覧です。

## 1. このPRの目的

**報酬金額は計算しないが、「本来報酬判定の対象となる可能性がある販売事実」を失わないための受け皿**を作ります。

PR-P1a で `commission_ledger` への新規計上を止めたため、Agency が稼働するまでの間、土地販売が起きても記録がどこにも残りません。その穴を埋めます。

**Passport は報酬の可否も金額も確定しません。** 記録するのは販売の事実だけです。

## 2. スコープ

| 含む | 含まない |
|---|---|
| 販売事実の**記録**（生成） | 報酬金額の計算・保存 |
| 冪等性・スナップショット | 報酬可否の**確定** |
| 生成／配送の2フラグ（両方 OFF 既定） | Agency への**配送**（受信契約完了まで実装しない） |
| `common_user_id` 未解決の追跡 | 既存 `commission_ledger` への影響 |

実行ルール §4 に従い、目的は「契約追加」ひとつに限定します。配送の実装は Agency 受信契約が確定してから別PRにします。

## 3. DB設計（修正指示1・2・3・4・5・7）

新規テーブル `sales_fact_outbox_events` を1本追加します。**追加型のみ。既存テーブルには触れません。**

### 3.1 列一覧

**A. ご指定の21項目**

| # | 列名 | 型 | NULL | 備考 |
|---:|---|---|---|---|
| 1 | `event_id` | `text` | ✕ | 決定的生成（§5.1） |
| 2 | `source_system_key` | `text` | ✕ | 固定値 `passport` |
| 3 | `occurred_at` | `timestamptz` | ✕ | 販売成立時刻（`purchases` 由来。記録時刻ではない） |
| 4 | `common_user_id` | `text` | **○** | 未解決を許容（§6） |
| 5 | `passport_user_id` | `uuid` | ✕ | **必ず保持**（C7 のご指示） |
| 6 | `purchase_id` | `uuid` | ✕ | |
| 7 | `castle_plot_id` | `uuid` | ○ | 土地以外では null |
| 8 | `product_type` | `text` | ✕ | `land_plot` 等 |
| 9 | `product_code` | `text` | ○ | 現状 Passport に商品コード台帳が無いため（§9 質問1） |
| 10 | `amount_minor` | `bigint` | ✕ | **整数の最小通貨単位**（§3.3） |
| 11 | `currency` | `text` | ✕ | **必須**。既定 `JPY` |
| 12 | `referral_session_key` | `text` | ○ | スナップショット |
| 13 | `registration_referrer_agency_id` | `text` | ○ | スナップショット |
| 14 | `assigned_agency_id` | `text` | ○ | スナップショット |
| 15 | `sales_agent_id` | `text` | ○ | スナップショット |
| 16 | `closing_agent_id` | `text` | ○ | スナップショット |
| 17 | `eligibility_status` | `text` | ✕ | **`reward_eligible` の置き換え**（§3.2） |
| 18 | `correlation_id` | `text` | ✕ | 購入から引き継ぐ |
| 19 | `delivery_status` | `text` | ✕ | 送信状態。既定 `pending` |
| 20 | `delivery_attempt_count` | `int` | ✕ | 再送回数。既定 `0` |
| 21 | `last_delivery_error` | `text` | ○ | 最終エラー |

**B. 修正指示3で追加**

| # | 列名 | 型 | NULL | 備考 |
|---:|---|---|---|---|
| 22 | `common_user_resolution_status` | `text` | ✕ | `UNRESOLVED` / `RESOLVED` / `FAILED` |
| 23 | `resolution_attempt_count` | `int` | ✕ | 既定 `0` |
| 24 | `last_resolution_error` | `text` | ○ | |
| 25 | `next_resolution_at` | `timestamptz` | ○ | 次回解決予定時刻 |

（Passport user ID は #5 として A に含めています）

**C. 冪等性・監査のために必要**

| # | 列名 | 型 | NULL | 備考 |
|---:|---|---|---|---|
| 26 | `payload` | `jsonb` | ✕ | 配送する本文のスナップショット |
| 27 | `payload_hash` | `text` | ✕ | 重複検知の照合用（§5.3） |
| 28 | `id` | `uuid` | ✕ | 主キー |
| 29 | `created_at` | `timestamptz` | ✕ | |
| 30 | `updated_at` | `timestamptz` | ✕ | |
| 31 | `delivered_at` | `timestamptz` | ○ | |

**合計31列**（ご指定21 + 追加4 + 運用7）。

### 3.2 `reward_eligible` を `eligibility_status` に置き換えます（修正指示2）

ご指示のとおり、**Passport 独自のルールで報酬可否を確定しません**。

```
eligibility_status: 'UNKNOWN' | 'POTENTIALLY_ELIGIBLE' | 'NOT_ELIGIBLE'
```

**当面すべて `UNKNOWN` を入れる方針を提案します。** 理由は次のとおりです。

`POTENTIALLY_ELIGIBLE` と `NOT_ELIGIBLE` を出し分けるには「どういう販売なら対象になりうるか」の判断基準が要ります。それは報酬ルールそのものであり、Agency の管轄です。Passport 側に基準を置くと、**名前を変えただけで実質的に報酬可否を判定していること**になります。

判定基準を Agency からご提示いただければ、その時点で出し分けを追加します。**この列がどう扱われるべきかは §9 質問2 でご確認ください。**

DB 制約と、値の意味をコメントに明記します。

> この列は販売事実に基づく**参考情報**であり、報酬確定値ではない。正式な報酬対象判定は Agency 側を正とする。

### 3.3 金額（修正指示4）

- `amount_minor bigint not null` — **整数の最小通貨単位**（JPY なら円そのもの）
- `currency text not null default 'JPY'`
- **浮動小数点は使いません**
- **報酬金額の列は作りません**

既存 `purchases.amount_received_yen` / `amount` はいずれも `int`（円）なので、そのまま `amount_minor` に入ります。将来 JPY 以外を扱う場合に備え、列名を `_yen` ではなく `_minor` にし、`currency` と対で解釈する形にします。

> 既存の `commission_ledger` は `amount_yen`（円固定）ですが、そちらは触りません。

### 3.4 スナップショット（修正指示7）

`referral_session_key` / `registration_referrer_agency_id` / `assigned_agency_id` / `sales_agent_id` / `closing_agent_id` は、**販売時点の値をコピーして保存**します。ユーザーマスタ側で担当者が変わっても、**既存行は一切更新しません**。

更新するのは配送・解決に関わる列（`delivery_*` / `common_user_id` / `common_user_resolution_*` / `payload` / `payload_hash` / `updated_at`）だけで、これを**テストで固定**します。

### 3.5 PII を入れません（修正指示7）

氏名・メール・住所・電話・カード情報は**列にもpayloadにも入れません**。入っていないことをテストで検証します（§8）。

保持するのは ID と金額と時刻だけです。Agency 側で ID から引ければ足ります。

## 4. 生成箇所

`runPurchaseGrant()` の土地販売経路に、`commission_posted` の**代わりではなく隣に**ステップを1つ足します。

```
plot_completed → commission_posted(停止中はスキップ) → sales_fact_recorded(新規) → notification_sent → referral_confirmed
```

既存の `runStep()` 機構（原子的 claim + fencing token）に乗せるため、**再実行しても二重に記録されません**。

**PR-P1a と同じく、失敗しても購入を壊しません。** 生成フラグ OFF のときは成功扱いでスキップします。

## 5. 冪等性（修正指示5）

### 5.1 `event_id` は決定的に生成

```
event_id = `sales_fact:${purchase_id}`
```

同じ購入からは常に同じ `event_id` になります。UUID 等のランダム値は使いません。

> 現状 `land_plot` は1購入=1販売事実なので、`purchase_id` だけで一意に定まります。1購入から複数の販売事実が出る商品が将来現れた場合は、`sales_fact:${purchase_id}:${明細ID}` に拡張します（§9 質問3）。

### 5.2 一意条件

```sql
unique (source_system_key, event_id)
```

`integration_inbox_events` / `entitlements` と同じ方式です。同一販売を10回処理しても行は1件です。

### 5.3 同じ `event_id` で payload が違う場合

`payload_hash`（payload の SHA-256）を保存し、`ignoreDuplicates` 付き upsert で**既存行を上書きしません**。挿入されなかった場合はハッシュを照合し、

- 一致 → 正常な重複。何もしない
- **不一致 → 整合性異常**。`admin_audit_logs` に `sales_fact_payload_mismatch` として記録し、運用ヘルスで検知できるようにする

**どちらの場合も購入処理は失敗させません**（修正指示5「重複によって購入処理を失敗させない」）。

### 5.4 `correlation_id`

購入処理から引き継ぎます。既存の購入フローに `correlation_id` が無いため、`purchase_id` を起点にした値を用いる案を §9 質問4 でご確認ください。

## 6. `common_user_id` 未解決の扱い（修正指示3・C7）

| 状況 | 動作 |
|---|---|
| 未解決でも | **販売事実は記録する**（失わない） |
| 未解決の間 | `common_user_resolution_status = 'UNRESOLVED'`、**Agency へ配送しない** |
| 解決後 | **同じ Outbox 行を補完して配送**（`event_id` は変えない） |

**同じ行を補完する方式を採ります。** 補完イベントを別行として作ると `event_id` が増え、Agency 側で「同じ販売の2通目」を判別する契約が追加で必要になります。決定的 `event_id` を維持したまま1行を更新するほうが、契約が単純です。

`payload` は配送直前に `common_user_id` を反映して作り直し、`payload_hash` も更新します。この更新は**スナップショット列には触れません**（§3.4）。

配送クエリの条件は `delivery_status = 'pending' and common_user_resolution_status = 'RESOLVED'` とし、**未解決行が配送対象に入らないことをテストで固定**します。

`next_resolution_at` は既存の `common_user_resolution_attempts` と同じ間隔設計に揃えます。

## 7. フラグ（修正指示6）

**生成と配送を分離**します。既存方式に合わせ、環境変数ではなく**設定テーブル**に置きます（このリポジトリには汎用の機能フラグ基盤が無く、設定は全てDBのドメイン別テーブルに統一されているため）。

```sql
create table if not exists sales_fact_outbox_settings (
  id uuid primary key default gen_random_uuid(),
  generation_enabled boolean not null default false,
  delivery_enabled   boolean not null default false,
  updated_at timestamptz not null default now()
);
```

| 要件 | 対応 |
|---|---|
| 両方とも未設定時 false | **行を投入しない**。コード側既定値が両方 `false` |
| 配送OFFでも生成済みOutboxは保持 | 配送フラグは送信処理だけを止め、行に触れない |
| Agency 受信契約完了まで配送OFF | 既定 OFF。配送処理自体を本PRでは実装しない |
| 管理画面からフラグを変更できない | 変更APIを作らない。参照のみ |
| 旧報酬計上を再開させない | **別テーブル・別フラグ**。`commission_write_settings` には一切触れない |

> **環境変数名でのご指定**（`PASSPORT_SALES_FACT_OUTBOX_GENERATION_ENABLED` 等）をいただきましたが、このリポジトリでは機能フラグに環境変数を使っている例が1つもありません。ADR-9（「既存の設定管理方式がある場合はそれに統合し、環境変数名を重複作成しない」）にも反します。**設定テーブル方式で進めてよいかを §9 質問5 でご確認ください。** 環境変数が必須であればそちらに合わせます。

PR-P1b と同じく、**コード側ゲート**も置きます。DB の設定行だけでは配送が始まりません。

## 8. テスト項目

### 8.1 ドメイン（純粋関数・vitest）

| # | 内容 |
|---|---|
| 1 | `event_id` が `purchase_id` から決定的に生成される（同じ入力→同じ出力） |
| 2 | `payload_hash` が同じ payload から同じ値になる |
| 3 | `eligibility_status` が3値以外を受け付けない |
| 4 | 金額が整数のまま保持され、小数が入らない |
| 5 | payload に PII 相当のキー（`name` / `email` / `address` / `phone` / `card`）が含まれない |
| 6 | 配送対象の判定が `pending` かつ `RESOLVED` に限定される |
| 7 | 未解決行が配送対象に入らない |
| 8 | 両フラグの既定が false |
| 9 | コード側ゲートが閉じている限り DB が true でも配送しない |

### 8.2 生成（`run-purchase-grant.test.ts` に追加）

| # | 内容 |
|---|---|
| 10 | 生成ONで土地購入時に販売事実が1件記録される |
| 11 | 生成OFFでも**購入は完走する**（`completed` になる） |
| 12 | 生成OFFのとき販売事実が記録されない |
| 13 | 同じ購入を10回処理しても1件のまま |
| 14 | 記録に失敗しても購入を失敗させない |
| 15 | `common_user_id` が null でも記録される |

### 8.3 構造（ソース走査。PR-P1b と同じ方式）

| # | 内容 |
|---|---|
| 16 | 販売事実テーブルへ insert するコードが1箇所だけ |
| 17 | フラグ変更API・変更コードが存在しない |
| 18 | スナップショット列を更新するコードが存在しない |
| 19 | `commission_write_settings` を参照・変更していない（旧報酬計上を再開させない） |
| 20 | 配送処理が本PRに含まれていない |

PR-P1b と同様、**主要なテストは意図的に壊して落ちることを確認**してから提出します。

### 8.4 マイグレーション

| # | 内容 |
|---|---|
| 21 | ローカル PostgreSQL 16 で全84本が空DBへ適用できる |
| 22 | 追加分の再実行が冪等 |

## 9. 確認をお願いしたい点

| # | 内容 |
|---|---|
| 1 | **`product_code` に何を入れるか。** Q5 で「共通の商品台帳は作らない／各システムがローカル設定で管理」と決まりました。Passport の担当は `kokudaka` / `gacha_ticket` / `land_plot` です。`product_code` にこの識別子をそのまま入れてよいか、別体系のコードがあるか |
| 2 | **`eligibility_status` を当面すべて `UNKNOWN` にする方針**（§3.2）。出し分けの基準は Agency の管轄と考えています。基準をご提示いただければ実装します |
| 3 | **`event_id = sales_fact:{purchase_id}`** の形式（§5.1） |
| 4 | **`correlation_id` の値。** 既存の購入フローに `correlation_id` がありません。`purchase_id` を起点にした値でよいか、Agency 側に採番規約があるか |
| 5 | **フラグを環境変数ではなく設定テーブルに置くこと**（§7）。既存方式との統一を優先する提案です |
| 6 | **`land_plot` 以外も記録するか。** 現状 `kokudaka` / `gacha_ticket` の購入は `agent_sales` に記録され、報酬計算はされていません。販売事実Outbox の対象を土地だけにするか、全商品にするか |
| 7 | **C6 の解決が前提**であること（ご指示どおり、実装完了・マージ・配送開始は行いません） |

## 10. 影響範囲

| 領域 | 影響 |
|---|---|
| 利用者 | **なし。** 生成フラグ既定OFF。ONにしても記録が増えるだけで挙動は変わりません |
| 管理者 | なし（本PRでは画面を追加しません） |
| 既存データ | **変更なし。** 追加型のみ |
| 他システム | **なし。** 配送は実装しません |
| 現時点の実データ | 土地販売が未稼働（Stripe未設定・城0件・区画0件）のため、**当面イベントは1件も発生しません** |

## 11. ロールバック

| 項目 | 内容 |
|---|---|
| 第1手段 | **生成フラグを OFF にする**（既定でOFF） |
| 第2手段 | コードの revert |
| データ | 追加テーブルは削除しません。既存データは一切変更しないため復旧不要 |

## 12. 作業範囲（C1 回答 8・着手承認範囲より）

本計画の提出までで止めています。**承認後も、C6 の正常動作を確認するまで、実装完了・マージ・配送開始には進みません。**

以下は承認まで行いません。

コード実装 / マイグレーション作成 / PR作成 / Agencyへの配送 / 本番フラグ変更 / 既存報酬データの変更・削除
