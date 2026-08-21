# C6 調査結果 — `cron_integration_outbox_drain` の実行記録が無い件

- 作成日: 2026-08-21
- 対象: `stockbusiness/sengokugacha`（Passport）
- 種別: **read-only 調査**。コード変更・DB変更・設定変更は行っていません。

## 1. 事象

`CRON_SECRET` 設定後、cron 3本のうち2本は実行記録が残ったが、1本だけ確認できていない。

| cron | 間隔 | 記録 |
|---|---|---|
| `cron_notification_outbox_drain` | `*/10 * * * *` | ✅ 18:01:32 |
| `cron_reconciliation` | `*/30 * * * *` | ✅ 18:00:48 |
| **`cron_integration_outbox_drain`** | `*/10 * * * *` | ❌ **なし** |

`notification-outbox` と**同じ10分間隔**なので、片方だけ記録が無いのは不自然。

## 2. 調べたこと（コード側）

### 2.1 2つの cron ルートはコメント以外に差分がない

`src/app/api/internal/cron/integration-outbox/route.ts` と `notification-outbox/route.ts` を、識別子を正規化して差分を取ったところ、**コメント文以外に差分はありません**。認証方式・実行時間上限・監査ログの記録タイミング・応答すべて同一です。

したがって「integration 側だけコードが違うから落ちる」という説明は成り立ちません。

### 2.2 記録は認証通過後に必ず呼ばれる

```ts
async function handle(): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();
  const result = await drainIntegrationOutbox(supabase, {...});
  await logAdminAction(null, "cron_integration_outbox_drain", `retried=... skipped=...`);
  return NextResponse.json({ ok: true, ...result });
}
```

`logAdminAction` の**前**で例外が出れば記録は残りません。記録が無い＝「呼ばれていない」か「`drainIntegrationOutbox()` が投げた」かのどちらかです。

### 2.3 処理対象0件なら例外は起きない構造

`drainOutboxTable()` は、対象行を select → 0件ならループを1回も回さず `{retried:0, sent:0, failed:0, dead:0, skipped:0}` を返します。送信関数（`confirmReferral`）は行が無い限り呼ばれません。

`integration_outbox_events` は空のはずなので、**正常なら「0件処理」の記録が残る**のが期待動作です。

### 2.4 両テーブルのスキーマは揃っている

`drainOutboxTable()` は両テーブルに対して同じ列を select します。

```
id, source_type, source_id, event_type, target_system_key,
payload, status, attempt_count, last_error, created_at, sent_at
```

マイグレーション上は、`notification_outbox_events` は `20260808000009` で全列を持って新規作成され、`integration_outbox_events` は同じマイグレーションで `source_type` / `source_id` が**後から追加**されています。

```sql
alter table integration_outbox_events
  add column source_type text not null,
  add column source_id text not null;
```

**この2列の追加はデフォルト値なしの NOT NULL です。** マイグレーション自身のコメントにも次の警告があります。

> 既存行は無い前提。もし本番に既存行がある場合、本マイグレーションは NOT NULL 制約の追加に失敗するため、事前に `select count(*) from integration_outbox_events;` で0件であることを確認すること。

**これが唯一見つかった、2テーブル間の非対称です。** もし本番でこの `alter table` だけが失敗し、後続の `create table notification_outbox_events` は成功していた場合、

- `notification_outbox_events` → 全列あり → drain 成功 → 記録あり ✅
- `integration_outbox_events` → `source_type` / `source_id` が無い → **select が列不在エラー** → `logAdminAction` に到達せず → 記録なし ❌

という、観測されている症状とちょうど一致する状態になります。

なお `20260808000009` は適用済みとして記録されています（83/83）。ただしこの運用は**SQLを手で流して記録を手でINSERTする**方式なので、「記録がある」ことは「全文が成功した」ことを保証しません。PR #164 の検知機構も、記録の有無しか見ていません。

## 3. 現時点の結論

**コードからは原因を特定できません。** 2つのルートは同一で、0件時に例外が出る経路もありません。原因は次のいずれかで、どれもコードの外にあります。

| # | 仮説 | 確からしさ | 確認方法 |
|---|---|---|---|
| A | `integration_outbox_events` に `source_type` / `source_id` が無い（2.4） | **中〜高**。唯一見つかった非対称で、症状と一致する | §4.1 のSQL |
| B | Vercel 側で cron が登録されていない（プラン上限・デプロイ時の取りこぼし等） | 中 | §4.2 |
| C | 実行はされたが 500 で落ちている | 中 | §4.3 |
| D | 実行タイミングの行き違い（まだ1度も発火していない） | 低。10分間隔なので考えにくい | §4.4 |

**仮説Aが本命**だと考えています。他の3つと違い、「なぜ integration だけなのか」を説明できるのはこれだけです。

## 4. 実施をお願いしたい確認（すべて read-only）

### 4.1 【最優先】両テーブルのスキーマ比較

Supabase SQL Editor で実行し、結果を貼ってください。**秘密値は出力されません。**

```sql
select json_build_object(
  'integration_列', (
    select json_agg(column_name order by ordinal_position)
    from information_schema.columns
    where table_name = 'integration_outbox_events'
  ),
  'notification_列', (
    select json_agg(column_name order by ordinal_position)
    from information_schema.columns
    where table_name = 'notification_outbox_events'
  ),
  'integration_件数', (select count(*) from integration_outbox_events),
  'notification_件数', (select count(*) from notification_outbox_events),
  'integration_status制約', (
    select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'integration_outbox_events_status_check'
  ),
  'notification_status制約', (
    select pg_get_constraintdef(oid) from pg_constraint
    where conname like 'notification_outbox_events_status%'
    limit 1
  )
) as スキーマ比較;
```

**見るべき点**: `integration_列` に **`source_type` と `source_id` が含まれているか**。

- 含まれていない → **仮説A で確定**。修正は追加型の `alter table` 1本で済みます（0件なので NOT NULL も安全に付けられます）
- 含まれている → 仮説A は否定。§4.2 以降へ

### 4.2 Vercel の cron 登録状況

Vercel → プロジェクト `sengokugacha` → **Settings → Cron Jobs** を開き、次をお知らせください。

- **3本すべて登録されているか**（`/api/internal/cron/integration-outbox` / `notification-outbox` / `reconciliation`）
- 各行の **Last Run** の日時と結果

`integration-outbox` が一覧に無ければ Vercel 側の登録漏れです。あれば Last Run の結果が答えになります。

### 4.3 Functions ログ

Vercel → Deployments → 最新デプロイ → **Functions** → `/api/internal/cron/integration-outbox`。

エラーがあれば、**HTTPステータス / 例外名 / stack trace** をお知らせください。**秘密値（トークン・キー・接続文字列）は伏せてください。** 認証は通っているはずなので、401 ではなく 500 が出ていると見ています。

### 4.4 記録の再確認

前回から時間が経っているので、その後に記録が付いていないか確認してください。

```sql
select action, details, created_at
from admin_audit_logs
where action like 'cron\_%'
order by created_at desc
limit 30;
```

## 5. 原因が判明した後の進め方

ご指示のとおり、**PR-P1c には混ぜず、cron 修正を先行する独立PR**として計画を提出します。

| 判明した原因 | 想定される修正 |
|---|---|
| A（列が無い） | 追加型マイグレーション1本（`add column if not exists`）。0件なので NOT NULL も安全 |
| B（cron 未登録） | コード修正不要。Vercel 側の設定またはプラン確認 |
| C（別の例外） | ログの内容次第。原因に応じた独立PR |

修正後は、ご指示のとおり**最低2回以上の定期実行成功**（＝ 記録が2件以上増えること）を確認してから完了とします。「対象0件でも成功記録が作られる」ことも同時に確認できます。

## 6. PR-P1c との関係

ご指示に従い、**PR-P1c の実装完了・マージ・配送開始は、本件の正常動作を確認するまで行いません。**

販売事実Outbox はこの drain 基盤の上に乗ります。**基盤が動かないまま実装すると、Outbox に貯まったイベントが誰にも送られず、しかもそれに気付けません。** 実装計画の作成は並行して進めます。
