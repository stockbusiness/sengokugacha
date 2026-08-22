# PR-P2a 実装計画 — Entitlement 適用範囲の allowlist 化

- 作成日: 2026-08-22
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: `01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` PR-P2、Q5・Q6・Q9 の回答
- 起点: `main` = `ef4fbde`
- **本計画の承認を受けるまで、コード変更・マイグレーション作成は行いません。**

---

## 1. このPRの位置づけ

指示書 PR-P2 のうち、**allowlist の明示化と非適用理由の記録**を扱います。商品所有者マップは PR-P2b です。

| 指示書の要求 | 本PR |
|---|---|
| 適用できる権利種別を明示的な allowlist にする | ✅ |
| allowlist は Passport 内ゲーム用途だけとし、既存識別子を棚卸しして確定 | ✅ |
| NFT作品・シリアル・未知の権利種別をローカル残高へ適用しない | ✅（既に満たされているが、明示化する） |
| 未知イベントは受信記録と理由を残し、再送で重複適用しない | ✅ |
| 商品所有者マップをコードまたは設定に置く | ❌ **PR-P2b** |

## 2. 現状の実測

### 2.1 受入条件は既に満たされています

`process_entitlement_grant()`（最新版 `20260810000001`）の残高適用判定です。

```sql
v_column := case v_entitlement.entitlement_type
  when 'kokudaka'     then 'kokudaka'
  when 'gacha_ticket' then 'gacha_tickets'
  else null
end;
```

`v_column` が null の場合は台帳記録のみで完了します。**NFT作品・シリアル・会員権・未知種別を受信しても、国高・ガチャチケットは変化しません。**

つまり指示書の受入条件「NFT/未知Entitlementを受けても国高・ガチャチケットが変化しない」は、**現時点で既に満たされています**。

### 2.2 では何が足りないのか

| 不足 | 内容 |
|---|---|
| **① 送信元を見ていない** | 判定は `entitlement_type` のみ。**どのシステムから来たかを問わない**。Q6 のご指示は「HMAC検証済み `source_system_key` と `entitlement_type` の**両方**が一致したときだけ適用」 |
| **② 理由が残らない** | 非適用と判定しても、その理由がDBに記録されない。「なぜ残高が動かなかったのか」を後から追えない |
| **③ 判定が2箇所に重複** | 同じ `case` 式が `process_entitlement_grant()` と `process_entitlement_revocation()` の**両方**にある。片方だけ直すと、付与は止まるのに取消では残高が動く、という不整合が起きうる |

③ は今回の変更で特に重要です。**allowlist を2箇所へ書くと、いずれ必ずずれます。**

### 2.3 現在の露出はゼロです

| 項目 | 実測 |
|---|---|
| `entitlements` の件数 | **0件** |
| `sen_no_kuni_hub_settings` の登録 | **0行**（＝どのシステムも認証を通せない） |

**外部Entitlement受信口は、現在すべての署名を拒否します。** 本PRは「これから起きることを止める」もので、いま動いているものを止めません。

## 3. 設計

### 3.1 判定を1箇所に集約する

新しいSQL関数を1本作り、付与と取消の**両方**がこれを呼びます。

```sql
entitlement_balance_column(p_source_system_key text, p_entitlement_type text) returns text
```

- 適用対象なら残高列名（`kokudaka` / `gacha_tickets`）を返す
- 対象外なら `null` を返す

既存の `case` 式を両関数から取り除き、この呼び出しに置き換えます。**allowlist の定義が1箇所になり、付与と取消でずれません。**

### 3.2 二段構えの allowlist

Q6 のご指示（案d）どおり、**送信元と種別の両方が一致したときだけ**適用します。

| 軸 | 置き場所 | 既定 | 理由 |
|---|---|---|---|
| **`entitlement_type`** | **コード**（SQL関数内の固定リスト） | `kokudaka` / `gacha_ticket` のみ | 適用先が `users` の実在する列である以上、種別を増やすにはどのみちコード変更が要る。設定で増やせるようにすると「列が無い種別」を許可できてしまう |
| **`source_system_key`** | **新規テーブル** `entitlement_source_allowlist` | **空**（＝どこからも適用しない） | 承認済み送信元は運用で増減する。ただし登録は明示的な操作に限る |

**送信元テーブルを空で出荷します。** 現在 `sen_no_kuni_hub_settings` が0行なので、そもそも誰も送信できません。将来ゲーム送信元を承認する際は、

1. `sen_no_kuni_hub_settings` に鍵を登録する（認証を通せるようになる）
2. `entitlement_source_allowlist` に追加する（残高適用が許可される）

の**2つが揃って初めて**残高が動きます。片方だけでは動きません。これは PR-P1a / PR5-a と同じ「2つの独立した承認」の形です。

### 3.3 禁止対象を明示的に記録する

Q6 でご指示いただいた、適用してはいけない送信元・種別です。

```
sennokuni-nft-market / sengoku-commerce / ove-wallet / 未知の source_system_key
generic / 未知の entitlement_type
```

allowlist 方式なので、**これらは「登録しない」ことで自動的に拒否されます。** ただし「意図して拒否している」ことが読み取れるよう、拒否対象として既知の値をコメントと**テスト**に残します。将来 `sengoku-commerce` を誤って allowlist へ足すと、テストが落ちます。

### 3.4 非適用の理由を記録する

`entitlements` に列を2本追加します。

```sql
alter table entitlements
  add column if not exists application_decision text,
  add column if not exists application_decision_reason text;
```

`application_decision` の値:

| 値 | 意味 |
|---|---|
| `APPLIED` | 残高へ適用した |
| `SOURCE_NOT_ALLOWED` | 送信元が allowlist に無い |
| `TYPE_NOT_APPLICABLE` | 種別が残高へ効果を持たない（NFT作品・会員権・`generic` 等） |
| `USER_UNRESOLVED` | `common_user_id` を解決できず適用できない |
| `DISMISSED` | 運用が再解決を却下済み |

**`application_status` は変更しません。** あちらは CHECK 制約と既存ロジック（claim・再入判定）が依存しており、値を増やすと影響が広がります。「処理が完了したか」を表す `application_status` と、「どう判定したか」を表す `application_decision` を分けます。

> **現行の挙動を1点そのまま引き継ぎます。** 種別が対象外の場合、現在は `application_status = 'applied'` になります（「台帳記録のみで完了」の意味）。これを変えると再送のたびに処理し直すことになるため、そのまま維持し、`application_decision` で区別できるようにします。

### 3.5 冪等性

既存の担保をそのまま使います。**変更しません。**

- `entitlements` の `unique (source_system_key, entitlement_id)`
- `claim_entitlement_application()` の原子的 claim

拒否された場合も `application_status` が進むため、**再送で重複適用されません**（指示書「再送で重複適用しない」）。

## 4. 変更予定ファイル

| # | ファイル | 変更 |
|---|---|---|
| 1 | `supabase/migrations/20260820000001_entitlement_allowlist.sql` | 新規。テーブル1本＋列2本＋判定関数1本＋既存2関数の `create or replace` |
| 2 | `src/lib/expected-migrations.ts` | version 1行追加 |
| 3 | `src/modules/entitlements/domain/allowlist.ts` (+test) | 新規。allowlist の定義と判定を純粋関数で表現 |
| 4 | `src/lib/entitlement-allowlist.ts` | 新規。allowlist の参照（読み取りのみ） |
| 5 | `src/app/api/admin/entitlements/unresolved/route.ts` ほか参照系 | `application_decision` を返すよう追加（画面表示は PR-P2b 以降） |
| 6 | `src/modules/entitlement-allowlist-guards.test.ts` | 新規。構造テスト |

**既存テーブル・列・履歴の削除や変更はありません。** 既存関数は `create or replace` で置き換えますが、**判定ロジックを外出しするだけで、適用結果は現状と同じ**です（送信元チェックが増える点を除く）。

## 5. テスト項目

### 5.1 純粋関数（vitest）

| # | 内容 |
|---|---|
| 1 | 許可された送信元 + `kokudaka` → 適用 |
| 2 | 許可された送信元 + `gacha_ticket` → 適用 |
| 3 | **許可されていない送信元 + `kokudaka` → 適用しない**（種別だけでは通らない） |
| 4 | 許可された送信元 + `generic` → 適用しない |
| 5 | `sennokuni-nft-market` / `sengoku-commerce` / `ove-wallet` が allowlist に**含まれていない** |
| 6 | 未知の送信元・未知の種別 → 適用しない |
| 7 | 種別の allowlist が `kokudaka` / `gacha_ticket` の2つだけ |
| 8 | 送信元 allowlist の既定が**空** |

### 5.2 ローカル PostgreSQL 16（実DB）

| # | 内容 |
|---|---|
| 9 | 空DBへ全86マイグレーションが適用できる |
| 10 | 追加分の再実行が冪等 |
| 11 | **allowlist が空のとき、`kokudaka` を受信しても `users.kokudaka` が変化しない** |
| 12 | allowlist に登録すると、`kokudaka` が適用される |
| 13 | 登録済み送信元でも `generic` は適用されない |
| 14 | **同じ entitlement を10回処理しても残高が1回分しか動かない** |
| 15 | 非適用時に `application_decision` と理由が記録される |
| 16 | **付与と取消で同じ判定が使われる**（付与が拒否された権利は、取消でも残高を動かさない） |
| 17 | 順序逆転（取消が先に届く）でも残高が0に収束する（既存の挙動を壊していない） |

**16 が本PRの要です。** 判定を1箇所に集約した意味がここに出ます。

### 5.3 構造テスト

| # | 内容 |
|---|---|
| 18 | 残高列名（`kokudaka` / `gacha_tickets`）を決める `case` 式が、判定関数以外に存在しない |
| 19 | `entitlement_source_allowlist` へ書き込むコードが存在しない（登録は運用DB操作に限る） |
| 20 | 拒否対象の既知の値が allowlist に含まれていない |

**PR-P1b / P1c / PR5-a と同じく、主要なテストは意図的に壊して落ちることを確認**してから提出します。

## 6. 影響範囲

| 領域 | 影響 |
|---|---|
| 利用者 | **なし。** `entitlements` は0件、受信口は0行で誰も送信できない |
| 管理者 | なし（画面変更は本PRに含めない） |
| 既存データ | **変更なし。** 既存の付与済み残高を取り消しません（変更禁止範囲） |
| 他システム | なし |
| **将来の受信** | **挙動が変わります。** 送信元を allowlist に登録するまで、`kokudaka` even も適用されません（§7） |

## 7. 挙動が変わる点（要確認）

**これが本PR唯一の実質的な変更です。**

現在は「登録済みの送信元なら、`kokudaka` / `gacha_ticket` は適用される」動作です。本PR後は「**送信元も allowlist に登録されていなければ適用されない**」に変わります。

現時点で登録済みの送信元が0件、`entitlements` も0件なので**実害はありません**。ただし、将来ゲーム送信元を接続する際に**allowlist への登録を忘れると、残高が反映されず原因が分かりにくい**という運用リスクが生まれます。

対策として、拒否時に `application_decision = 'SOURCE_NOT_ALLOWED'` と理由を記録し、**`/admin/entitlements/unresolved` から原因が読めるように**します。

## 8. ロールバック

| 手段 | 内容 |
|---|---|
| 第1 | `entitlement_source_allowlist` に送信元を登録する（＝従来の挙動へ戻す） |
| 第2 | 旧版の `process_entitlement_grant()` / `process_entitlement_revocation()` を `create or replace` で戻す |
| データ | 追加テーブル・追加列は削除しない。既存データを一切変更しないため復旧不要 |

## 9. 確認をお願いしたい点

| # | 内容 |
|---|---|
| 1 | **`entitlement_type` の allowlist をコードに置くこと**（設定で増やせるようにすると、`users` に列が無い種別を許可できてしまうため） |
| 2 | **`source_system_key` の allowlist を新規テーブルに置き、空で出荷すること**（§3.2）。登録は運用DB操作に限り、変更APIは作りません |
| 3 | **§7 の挙動変更**（送信元未登録だと `kokudaka` も適用されなくなる）を受け入れること |
| 4 | `application_status` は変更せず、`application_decision` を別列として足すこと（§3.4） |
| 5 | 判定を1関数へ集約し、既存の2関数を `create or replace` で置き換えること（§3.1） |
| 6 | マイグレーション作成前に `entitlements` が0件であることを read-only で再確認すること |

## 10. 作業範囲

本計画の提出までです。承認まで以下は行いません。

コード変更 / マイグレーション作成 / PR作成 / 本番設定変更 / 既存データの変更・削除

---

## 11. 実装中に見つかった設計上の欠陥と修正（2026-08-22 追記）

ローカル PostgreSQL 16 での検証中に、**本計画そのものの欠陥**を1件見つけたため、実装では設計を修正しました。事後報告になりますが、内容をご確認ください。

### 11.1 何が問題だったか

計画では「付与と取消が**同じ判定関数**を呼ぶ」ことを要としていました（§3.1）。しかしこれは誤りでした。

`entitlement_type` は行ごとに**不変**なので、従来は取消の時点で再判定しても同じ答えになりました。ところが `source_system_key` の allowlist は**運用で変わります**。判定を取消の時点で再評価すると、次の2つが起きます。

| 順序 | 起きること |
|---|---|
| 未許可のまま付与 → 後から承認 → 取消 | **一度も入れていない残高を引く** |
| 許可して付与 → 後から承認を取り消す → 取消 | **入れた残高を戻さない** |

実DBで再現を確認しました（国高 300 の利用者に未許可の送信元から 100 の付与→後から承認→取消で、**残高が 200 になる**）。

### 11.2 修正内容

取消の判断根拠を「いま許可されているか」から「**付与時に実際へ残高へ入れたか**」に変えました。

| 関数 | 役割 | 付与 | 取消 |
|---|---|---|---|
| `entitlement_balance_column_for_type(type)` | 種別 → 残高列。**対応表はここ1箇所だけ** | 経由 | 直接 |
| `entitlement_balance_column(source, type)` | 上記 + 送信元 allowlist | 使う | **使わない** |
| `entitlement_balance_was_applied(decision)` | 付与時に入れたか（`application_decision = 'APPLIED'`） | — | 使う |

計画が解こうとした「対応表が2箇所にあり、片方だけ直すとずれる」問題は、`entitlement_balance_column_for_type()` への集約で解決しています。allowlist の適用箇所が付与側だけになった点が計画との差分です。

`application_decision` を持たない行（本マイグレーション以前に適用済みの行）は、当時の規則で実際に加算されているため**戻す対象**として扱います。本番の `entitlements` は0件のため該当行はありませんが、規則としては明示しました。

### 11.3 併せて修正した点

順序逆転（取消が付与より先に届く）で残高操作が不要だった場合、従来は `claimed_reversal_pending` を返していました。`/admin/entitlements` の再解決画面はこれを「未解決」と数えるため、運用が再試行を止められません。従来は `generic` 等に限られたため放置できましたが、送信元を判定へ加えるとこの経路が常態になるため、取消が完了している場合は `claimed_then_reversed` を返すようにしました。

### 11.4 追加した検証

| # | 内容 | 結果 |
|---|---|---|
| H | 未許可のまま付与 → 後から承認 → 取消で、残高が減らない | 300 → 300 |
| M | 許可して付与 → 承認取消 → 取消で、残高が正しく戻る | 25 → 20 |
| L | `application_decision` が無い旧行は取消で戻る | 350 → 300 |
| R | 取消を10回呼んでも1回分しか動かない | 300 |
