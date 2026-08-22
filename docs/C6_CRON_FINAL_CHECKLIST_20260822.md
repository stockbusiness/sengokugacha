# C6 最終確認資料 — `cron_integration_outbox_drain` の実行記録が無い件

- 作成日: 2026-08-22
- 対象: `stockbusiness/sengokugacha`（Passport）
- 種別: **read-only 調査**。コード変更・DB変更・設定変更は行っていません。
- 前版: `docs/C6_CRON_INTEGRATION_OUTBOX_INVESTIGATION_20260821.md`

---

## 0. 前版の記述を1点訂正します

前版で次のように書きました。

> 記録が無い＝「呼ばれていない」か「`drainIntegrationOutbox()` が投げた」かのどちらかです。

**これは誤りでした。第3の可能性があります。**

`logAdminAction()`（`src/lib/admin-audit-log.ts:31`）は、**監査ログの記録に失敗しても例外を投げません**。

```ts
    if (error) console.error("監査ログの記録に失敗しました", error);
  } catch (error) {
    console.error("監査ログの記録に失敗しました", error);
  }
```

つまり **「cron は正常に実行され、HTTP 200 を返したが、監査ログの insert だけが失敗した」** 場合も、記録は残りません。ルートは `{ ok: true }` を返して成功します。

この訂正は診断の進め方を変えます。**「監査ログに記録が無い」ことは「cron が動いていない」ことの証拠になりません。** ご指示の「cron が未実行なのか、実行されたが記録されていないのか」という切り分けは、まさにこの点を突いています。

**そのため本資料では、監査ログではなく HTTP 応答を一次証拠とする手順**に組み替えました。

---

## 1. 切り分けの全体像

3つの可能性を、**上から順に1つずつ潰します**。

| # | 可能性 | 判定方法 | 決定的か |
|---|---|---|---|
| **A** | **呼ばれていない**（Vercel が cron を発火していない） | Vercel Cron Jobs 画面の Last Run | ◎ |
| **B** | **呼ばれたが処理が落ちている**（500 等） | 手動呼び出しの HTTP 応答 | ◎ |
| **C** | **正常に動いたが監査ログだけ失敗**（§0） | 手動呼び出しが 200 なのに記録が増えない | ◎ |

**手順1（手動呼び出し）だけで B と C を切り分けられ、A もほぼ判定できます。** ここから始めてください。

---

## 2. 手順1【最優先】cron エンドポイントを手動で1回呼ぶ

Vercel の cron を待たずに、同じエンドポイントを直接叩きます。**これが最も決定的な検査**です。

### 2.1 実行

`CRON_SECRET` の値をお持ちの端末で、次を実行してください。`<CRON_SECRET>` は実際の値に置き換えます。

```bash
curl -i -X POST \
  -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<本番ドメイン>/api/internal/cron/integration-outbox"
```

> **この curl コマンドと出力をそのまま貼らないでください。** `Authorization` ヘッダーに秘密値が含まれます。**下記2.2の判定結果だけ**をお知らせください。

比較のため、動いている方も同様に叩くと差が見えます。

```bash
curl -i -X POST \
  -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<本番ドメイン>/api/internal/cron/notification-outbox"
```

### 2.2 応答の読み方

| HTTP | 応答本文 | 意味 | 次にやること |
|---|---|---|---|
| **200** | `{"ok":true,"retried":0,...}` | **処理は正常**。可能性 B は否定 | → 手順2へ（C か A の切り分け） |
| **500** | `{"error":"internal error"}` 等 | **可能性 B で確定**。処理が落ちている | → 手順3へ（原因特定） |
| **401** | `{"error":"unauthorized"}` | `CRON_SECRET` が Vercel と一致していない、または再デプロイ未実施 | 環境変数を確認し再デプロイ |
| **404** | — | ルートがデプロイされていない | デプロイ内容を確認 |

`notification-outbox` が 200 で `integration-outbox` が 500 なら、**その差が原因そのもの**です。

---

## 3. 手順2 手動呼び出しが 200 だった場合

処理は動いています。残るのは **A（Vercel が発火していない）** か **C（監査ログだけ失敗）** です。

### 3.1 記録が増えたかを確認

手動呼び出しの**直後**に実行してください。

```sql
select action, details, created_at
from admin_audit_logs
where action like 'cron\_%'
order by created_at desc
limit 20;
```

| 結果 | 判定 |
|---|---|
| `cron_integration_outbox_drain` が**今の時刻で増えている** | **可能性 C は否定**。記録機構は正常 → **A で確定**（Vercel が発火していない）→ 手順4へ |
| **増えていない**（200 なのに記録なし） | **可能性 C で確定**。監査ログの insert が黙って失敗している → 手順3へ |

### 3.2 なぜこの2つを分ける必要があるか

- **A** なら、コード修正は不要です。Vercel 側の設定・プラン・登録の問題です
- **C** なら、コード修正が必要です。しかも**この不具合は他の cron や監査ログ全体に及ぶ可能性**があり、影響範囲が広くなります

---

## 4. 手順3 原因の特定（500 または C の場合）

Vercel → Deployments → 最新デプロイ → **Functions** → `/api/internal/cron/integration-outbox` のログを開いてください。

**お知らせいただきたいもの**

- HTTP ステータス
- 例外名とメッセージ
- stack trace の**先頭5行程度**
- `監査ログの記録に失敗しました` という文字列が出ていないか（**C の直接証拠**です）

> **秘密値（トークン・キー・接続文字列・本番URLの秘密部分）は伏せてください。** テーブル名・列名・エラーコードは伏せずにお願いします。原因特定に必要です。

### 4.1 現時点で最有力の仮説（前版から継続）

`20260808000009` が `integration_outbox_events` に対して **デフォルト値なしの NOT NULL 列2本を後から追加**しています。

```sql
alter table integration_outbox_events
  add column source_type text not null,
  add column source_id text not null;
```

同じマイグレーション内で `notification_outbox_events` は**全列を持って新規作成**されます。**これが2テーブル間で見つかった唯一の非対称**です。

`alter table` だけが失敗して `create table` は成功していた場合、drain の select が列不在で落ち（可能性 B）、症状と一致します。

これを直接確認する SQL です。

```sql
select json_build_object(
  'integration_列', (
    select json_agg(column_name order by ordinal_position)
    from information_schema.columns where table_name = 'integration_outbox_events'
  ),
  'notification_列', (
    select json_agg(column_name order by ordinal_position)
    from information_schema.columns where table_name = 'notification_outbox_events'
  ),
  'integration_件数', (select count(*) from integration_outbox_events),
  'notification_件数', (select count(*) from notification_outbox_events)
) as スキーマ比較;
```

**`integration_列` に `source_type` と `source_id` が含まれているか**が判定点です。含まれていなければ仮説確定で、修正は**追加型の `alter table` 1本**で済みます（0件なので NOT NULL も安全に付けられます）。

---

## 5. 手順4 Vercel の発火状況（可能性 A の場合）

Vercel → プロジェクト `sengokugacha` → **Settings → Cron Jobs**。

**お知らせいただきたいもの**

- **3本すべて登録されているか**（`integration-outbox` / `notification-outbox` / `reconciliation`）
- 各行の **Last Run** の日時と結果

`vercel.json` には3本が定義されています。

```json
{ "path": "/api/internal/cron/integration-outbox",  "schedule": "*/10 * * * *" },
{ "path": "/api/internal/cron/notification-outbox", "schedule": "*/10 * * * *" },
{ "path": "/api/internal/cron/reconciliation",      "schedule": "*/30 * * * *" }
```

`integration-outbox` が一覧に無ければ Vercel 側の登録漏れです。あれば Last Run の結果が答えになります。

**プランの上限もご確認ください。** Vercel のプランによっては同時に登録できる cron 数や実行頻度に制限があります。3本目だけが落ちる、という形はここで説明が付く可能性があります。

---

## 6. 原因別の対処

ご指示のとおり、**PR-P1c には混ぜず、cron 修正を先行する独立PR**として計画を提出します。

| 判明した原因 | 対処 | PR の要否 |
|---|---|---|
| **A** Vercel が発火していない | 設定・プランの見直し | **コード変更なし** |
| **B-1** `source_type` / `source_id` が無い | 追加型マイグレーション1本（`add column if not exists`） | 独立PR |
| **B-2** それ以外の例外 | ログの内容次第 | 独立PR |
| **C** 監査ログの insert が失敗 | **影響範囲が広いため要注意**（§7） | 独立PR |

### 6.1 再発防止（どの原因でも入れるべきもの）

今回の一件は、**「記録が無い」ことの意味が曖昧だったために切り分けに時間がかかりました**。原因が何であれ、次を提案します。

- `logAdminAction()` が失敗したことを、呼び出し元が知る手段を用意する（現状は `console.error` のみで、運用画面からは見えません）
- cron の実行記録を運用ヘルス画面に出し、**「最後に実行された時刻」が古い cron を検知**する（今回は SQL を手で叩くまで気付けませんでした）

いずれも C6 の修正PRに同梱するか、別PRにするかはご指示ください。

---

## 7. C だった場合の注意

**可能性 C は、見た目より影響が大きい問題です。**

`logAdminAction()` は cron 専用ではありません。**管理画面のあらゆる操作、報酬計上の停止記録（PR-P1a）、販売事実の不整合検知（PR-P1c）が、すべてこの関数で記録されます。**

C であれば、それらの監査ログも**黙って失われている可能性**があります。「監査ログがあるから追跡できる」という前提が崩れるため、C の場合は PR-P1c より先に手当てすべきと考えます。

---

## 8. 完了条件（ご指示より）

| # | 条件 |
|---|---|
| 1 | 原因が A / B / C のいずれかに確定している |
| 2 | 必要な修正と再発防止テストが入っている |
| 3 | staging（本環境）で cron・outbox の稼働を確認 |
| 4 | **対象0件でも成功記録が作られる**ことを確認 |
| 5 | **最低2回以上の定期実行成功**を確認 |

> **5 の判定方法について。** §0 のとおり、監査ログの件数だけでは「実行されたが記録されなかった」ケースを見逃します。**Vercel Cron Jobs 画面の Last Run と、監査ログの両方**で確認することを提案します。片方だけでは不十分です。

---

## 9. 今すぐお願いしたいこと

**§2 の手動呼び出し1回だけ**です。HTTP ステータス（200 / 500 / 401 / 404）をお知らせください。それだけで A・B・C のどれかがほぼ決まり、次の手順が確定します。

秘密値を含むコマンドや出力は貼らず、**ステータスコードと、記録が増えたかどうか**だけで十分です。
