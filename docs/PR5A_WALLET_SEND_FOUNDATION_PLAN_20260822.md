# PR5-a 実装計画 — Wallet送信の基盤（外部送信なし）

- 作成日: 2026-08-22
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: 「千ノ国パスポート × OVEW Wallet 次工程実装指示書」（2026-08-22版）§5・§6、および 8/22 のご指示1〜5
- 起点: `main` = `792f2bd`（PR #170 未マージ）
- **本計画の承認、および C6 の結論が出るまで、コード変更は開始しません。**

## 0. このPRがやらないこと

先に境界を明示します。指示書 §6 の PR5-a は「外部送信なし」です。

| やらない | 理由 |
|---|---|
| Wallet HTTP アダプタの実装 | PR5-b。Wallet 担当者の回答待ち |
| 実送信・Feature Flag の有効化 | ご指示2「実送信は従来の実施順序どおり」 |
| 本番APIキー・署名鍵の投入 | 同上 |
| `common_user_id` を使った送信 | ご指示1。正式回答が出るまで禁止 |
| `users.id` を暫定 `external_user_id` として送ること | ご指示1・指示書 禁止1 |
| 旧3,000 OVE の遡及付与 | ご指示2 |
| 未解決利用者への付与 | ご指示1 |

**このPRの成果物は、Fake アダプタに対してだけ動く状態機械です。** 実際の通信は1バイトも発生しません。

## 1. 前提の確認（read-only。マイグレーション作成前に実施）

ご指示3の「既存レコードが0件であることを、マイグレーション作成前に read-only で再確認」に対応します。

```sql
select json_build_object(
  '付与要求_全件',       (select count(*) from learning_journey_reward_requests),
  '付与要求_状態別',     (select json_agg(json_build_object('status', status, 'count', c))
                          from (select status, count(*) as c
                                from learning_journey_reward_requests group by status) s),
  '完了イベント',        (select count(*) from learning_journey_completion_events),
  '受講登録',            (select count(*) from learning_journey_enrollments),
  'コース',              (select count(*) from learning_journey_courses),
  'ミッション',          (select count(*) from learning_journey_missions),
  'フラグ',              (select row_to_json(s) from (
                            select missions_enabled, rewards_enabled,
                                   consultation_sync_enabled, line_notifications_enabled
                            from learning_journey_settings limit 1) s)
) as 事前確認;
```

**期待値**: 付与要求0件、完了イベント0件、コース0件、フラグ行なし（＝コード既定で全OFF）。

**0件でなかった場合は、マイグレーションを作らずに一度ご相談します。** 状態の追加・変更は既存レコードの解釈を変えるため、実データがある状態で独断では進めません。

## 2. ご指示3を反映した設計変更

指示書 §5.2 は `learning_journey_reward_requests.status` に `REWARD_DISABLED` と `DEFERRED_DECISION` を加える形でしたが、**ご指示3により方針を変更**します。

### 2.1 付与要求テーブルの状態は7つのまま

```
PENDING / PROCESSING / SUCCEEDED / FAILED / LIMIT_HELD / CANCELLED / REVERSED
```

**現行の CHECK 制約をそのまま維持し、変更しません。** `CANCELLED` は「Wallet へ送信する前の付与要求を管理者判断で取消す」用途として存続します。

### 2.2 付与機能OFF時は、付与要求を作らない

ご指示3の「付与機能がOFFの場合は、原則として付与要求を作成しない」に従います。

これは**指示書 禁止2**（「付与OFF期間の完了を無条件に PENDING へ溜め、後日すべて自動送信してはいけない」）への対応でもあります。**そもそも PENDING を作らなければ、後日一括送信という事故が起きません。**

### 2.3 判定結果は別テーブルに持つ

「必要な記録は、ミッション完了記録または別の付与判定記録に、送信状態とは別の区分として保持」とのご指示です。

**新規テーブル `learning_journey_reward_decisions` を提案します。** 完了イベント1件につき最大1行です。

```sql
create table if not exists learning_journey_reward_decisions (
  id uuid primary key default gen_random_uuid(),
  completion_event_id uuid not null unique
    references learning_journey_completion_events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,

  -- 付与要求を作ったか、作らなかったか。作らなかった場合はその理由。
  decision text not null check (decision in (
    'REQUESTED',           -- 付与要求を作成した(reward_request_id に紐づく)
    'REWARD_DISABLED',     -- 完了時点で付与制度が無効
    'DEFERRED_DECISION',   -- 対象者・予算・付与方針が未決定
    'NOT_ELIGIBLE'         -- 付与対象外のミッション(金額0等)
  )),
  reward_request_id uuid unique references learning_journey_reward_requests(id),

  -- 判定時点の根拠。後から設定が変わっても、当時なぜそう判定したかを追える。
  decided_amount integer not null default 0 check (decided_amount >= 0),
  decision_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**完了記録そのもの（`learning_journey_completion_events`）に列を足さない理由**: あちらは「学習が完了した」という事実の記録で、付与制度の状態とは寿命が違います。付与方針は今後何度も変わりますが、完了した事実は変わりません。混ぜると、制度変更のたびに学習記録のスキーマを触ることになります。

### 2.4 後日 PENDING へ変更する場合の必須要件

ご指示3の5点を、**このPRでは「実装しない」ことを明示します**。

| 必須要件 | 本PRでの扱い |
|---|---|
| 対象者の再判定 | **実装しない** |
| 付与予算の確認 | **実装しない** |
| 重複付与確認 | **実装しない** |
| 管理者の明示承認 | **実装しない** |
| 操作理由と監査ログ | **実装しない** |

**「REWARD_DISABLED / DEFERRED_DECISION を PENDING へ変える経路そのものを作りません。」**

5要件を満たさない変更経路が先に存在すると、それが抜け道になります。経路を作るのは、5要件を同時に実装できる段階（PR5-c 以降）です。**「無条件の自動一括付与は禁止」を、機能の不在によって保証します。**

これを構造テストで固定します（§6.3）。

## 3. 実装範囲（指示書 §6 PR5-a）

| # | 成果物 | 内容 |
|---|---|---|
| 1 | 契約型 | Wallet 付与・取消のリクエスト/レスポンス型。**識別子は未確定のため抽象化**（§4） |
| 2 | 状態機械 | 純粋関数。指示書 §5.2 の遷移表を実装 |
| 3 | Fake アダプタ | 成功・一時障害・恒久エラー・上限・タイムアウト・応答喪失を再現 |
| 4 | 冪等性キー生成 | 純粋関数。`completion_event_id` から決定論的に生成 |
| 5 | claim / fencing | 既存 `purchase_grant_steps` / outbox と同じ方式の設計＋単体テスト |
| 6 | 判定記録 | §2.3 の新規テーブルと、判定を行う純粋関数 |

## 4. 識別子を抽象化する（ご指示1・5）

**A-1 が未確定なため、送信する識別子の型を確定させません。**

```
export type WalletUserRef =
  | { kind: "external_user_id"; serviceCode: string; externalUserId: string }
  | { kind: "common_user_id"; commonUserId: string };
```

判別可能ユニオンにしておき、**どちらに決まっても型が受け止められる**形にします。Wallet 担当者の正式回答が届いた時点で、片方を選ぶだけになります。

**このPRでは、どちらの値も実際には組み立てません。** Fake アダプタは `WalletUserRef` を受け取るだけで中身を見ません。

**ご指示1の禁止事項を構造で守ります。**

| 禁止 | 守り方 |
|---|---|
| `common_user_id` を使った実送信 | HTTP アダプタが存在しない |
| `users.id` を暫定 `external_user_id` として送信 | `users.id` を `WalletUserRef` に入れるコードを書かない。構造テストで固定 |
| メール・LINE ID 等から共通IDを推測 | 該当コードを書かない。構造テストで固定 |
| 未解決ユーザーの自動統合 | 該当コードを書かない |

## 5. 状態機械（指示書 §5.2）

純粋関数として実装します。DB も HTTP も触りません。

```
transition(current, event) -> { next, effects } | { error }
```

| 現在 | 条件 | 次 |
|---|---|---|
| PENDING | 送信権獲得 | PROCESSING |
| PROCESSING | Wallet 成功 | SUCCEEDED |
| PROCESSING | 一時障害 | FAILED（再試行可） |
| PROCESSING | 恒久エラー | FAILED（自動再試行停止） |
| PENDING | 上限超過 | LIMIT_HELD |
| PENDING / LIMIT_HELD | 管理者取消 | CANCELLED |
| SUCCEEDED | 承認済み取消 | REVERSED |

**`REWARD_DISABLED` / `DEFERRED_DECISION` はこの表に入りません**（§2.1）。付与要求が作られる前の判定なので、状態機械の外です。

**LIMIT_HELD は外部送信前に判定します**（指示書 §2）。`PENDING → PROCESSING` の遷移条件に上限チェックを含め、**LIMIT_HELD が outbox 投入より前に確定する**ことをテストで固定します。

## 6. テスト項目

### 6.1 純粋関数

| # | 内容 |
|---|---|
| 1 | 冪等性キーが `completion_event_id` から決定論的に生成される |
| 2 | 同じ入力から常に同じキー。再送でキーが変わらない |
| 3 | 取消キーは付与キーと別の値になる |
| 4 | 状態遷移表の全遷移が期待どおり |
| 5 | 表にない遷移が拒否される（例: SUCCEEDED → PROCESSING） |
| 6 | LIMIT_HELD が PENDING から直接決まり、PROCESSING を経由しない |
| 7 | 判定関数が付与OFF時に `REWARD_DISABLED` を返し、付与要求を作らせない |
| 8 | 金額0のミッションが `NOT_ELIGIBLE` になる |

### 6.2 Fake アダプタ・並列（指示書 §6「単体・並列テスト成功」）

| # | 内容 |
|---|---|
| 9 | 同じ要求を並列10実行しても、送信権を得る worker は1つだけ |
| 10 | PROCESSING 期限切れ回収で fencing token が更新される |
| 11 | **古い worker の成功応答が状態を上書きしない** |
| 12 | 一時障害でバックオフ、恒久エラーで自動再試行停止 |
| 13 | 応答喪失（タイムアウト）後の再送で二重付与にならない |
| 14 | Fake が「同一キー・異なる金額」を拒否する |

### 6.3 構造テスト（PR-P1b / P1c と同じソース走査方式）

| # | 内容 |
|---|---|
| 15 | **Wallet へ HTTP 送信するコードが存在しない**（`fetch` の不在） |
| 16 | `users.id` を Wallet 識別子として渡すコードが存在しない |
| 17 | メール・LINE ID から共通IDを導出するコードが存在しない |
| 18 | **`REWARD_DISABLED` / `DEFERRED_DECISION` を `PENDING` へ変更する経路が存在しない**（§2.4） |
| 19 | `reward_requests.status` の CHECK 制約が7状態のまま |
| 20 | Feature Flag の既定が OFF |

**PR-P1b / P1c と同じく、主要なテストは意図的に壊して落ちることを確認**してから提出します。

### 6.4 秘密値

| # | 内容 |
|---|---|
| 21 | 保存する列に署名値・APIキー・トークンが含まれない（指示書 §5.1） |
| 22 | ログ出力に秘密値が入らない |

## 7. 保存する情報（指示書 §5.1）

Wallet 取引ID、最終試行時刻、試行回数、次回試行時刻、エラーコード、`request_id` を保存します。**秘密情報・署名値は保存しません。**

既存の `learning_journey_reward_requests` に不足列があれば追加型で足します。§1 の事前確認で現行スキーマを確定させてから、最終的な列一覧を提示します。

## 8. Feature Flag

既存の `learning_journey_settings` に**送信先切替**を1つ足します。

```
wallet_adapter: 'fake' | 'http'   -- 既定 'fake'
```

**このPRでは `'http'` を選んでも動きません**（アダプタが存在しないため）。値だけ先に用意し、PR5-b で中身を入れます。

PR-P1b / P1c と同じく、**コード側ゲート**も置きます。DB の設定だけでは `http` に切り替わりません。

## 9. 影響範囲

| 領域 | 影響 |
|---|---|
| 利用者 | **なし。** 「はじまりの旅」は全フラグ OFF・コース0件で凍結中 |
| 管理者 | **なし**（管理画面は PR5-c） |
| 既存データ | **変更なし**。追加型のみ |
| 他システム | **なし。** 通信は発生しません |
| 既存の PR-P1 系列 | **なし。** 触るテーブル・コードが重なりません |

## 10. ロールバック

| 手段 | 内容 |
|---|---|
| 第1 | `wallet_adapter` を `fake` に戻す（既定で `fake`） |
| 第2 | コードの revert |
| データ | 追加テーブルは削除しない。既存データを変更しないため復旧不要 |

## 11. 前提条件と着手可否

| 前提 | 状態 |
|---|---|
| 本計画の承認 | **未取得** |
| **C6 の結論** | **未取得**。ご指示4により、これが出るまでコード変更に着手しません |
| §1 の事前確認（0件検証） | **未実施**。マイグレーション作成前に実施します |
| A-1 / A-5 の Wallet 回答 | **未取得**。PR5-a には不要（識別子を抽象化するため）だが、PR5-b には必須 |

## 12. 確認をお願いしたい点

| # | 内容 |
|---|---|
| 1 | **判定記録を新規テーブル `learning_journey_reward_decisions` に持つこと**（§2.3）。完了記録に列を足さない理由は本文のとおりです |
| 2 | **`REWARD_DISABLED` / `DEFERRED_DECISION` → `PENDING` の変更経路を、このPRでは作らないこと**（§2.4）。5要件を同時に実装できる段階まで、機能の不在で禁止を保証します |
| 3 | `wallet_adapter` フラグを既存の `learning_journey_settings` に足すこと（新規テーブルを作らない）（§8） |
| 4 | §1 の事前確認が0件でなかった場合、マイグレーションを作らず相談すること |
| 5 | 指示書 §9 の提出物一覧・§10 の完了報告テンプレートは、PR5-a の PR 本文に含める形でよいか |

## 13. 作業範囲

本計画の提出までです。以下はご指示どおり行いません。

コード実装 / マイグレーション作成 / PR作成 / 実送信 / Feature Flag 有効化 / 本番設定変更 / 既存データの変更・削除
