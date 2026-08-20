# PR-P3 実装計画 — OVE誤表示の解消

- 作成日: 2026-08-20
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: `01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` PR-P3 / Q7 回答（案 c）
- 本計画の承認を受けるまで、コード変更は開始しません。

## 1. このPRで満たす条件（Q7 回答より）

| # | 条件 | 満たし方 |
|---|---|---|
| 1 | `contribution_points` を OVE として表示しない | 唯一の該当箇所である `OveWalletCard` を撤去 |
| 2 | Wallet未接続時に OVE残高を表示しない | 撤去により、OVEを名乗る残高表示が0箇所になる |
| 3 | 国家貢献ポイントとして正しい名称で表示する | 同一画面の `ContributionCard`（既存）が担う。**新規実装は不要** |
| 4 | Wallet API の値を推測しない | Wallet API を呼ばない（接続はこのPRの範囲外） |
| 5 | 取得失敗時に前回値を確定残高として表示しない | 同上。将来仕様を §6 に定義するのみ |

Wallet接続、`common_user_id` 重複テストは、Q7 回答どおり別PRへ繰り延べます。

## 2. 現在 OVE と表示している箇所（全数）

`src/` 配下で文字列 `OVE` を含むファイルは7つあります。**残高として表示しているのは1つだけ**です。

| ファイル | 種別 | 現在の挙動 | 本PRでの扱い |
|---|---|---|---|
| `src/components/economy/OveWalletCard.tsx` | **残高表示** | 「OVE移行予定ポイント(準備中)」として `users.contribution_points` を1:1で表示 | **撤去** |
| `src/app/(app)/journey/progress/page.tsx` | 報酬額表示 | コメント内のみ。実際の表示は下記 `describeRewardDisplay()` 経由 | 変更しない（§2.1） |
| `src/modules/learning-journey/domain/reward-policy.ts` | 報酬額表示 | `describeRewardDisplay()` | 変更しない（§2.1） |
| `src/modules/learning-journey/domain/progress.ts` | 報酬額集計 | 同上 | 変更しない |
| `src/lib/learning-journey-settings.ts` | 設定 | フラグ名のコメント | 変更しない |
| `…/reward-policy.test.ts` / `…/progress.test.ts` | テスト | — | 変更しない |

### 2.1 「はじまりの旅」側の OVE 表示について（確認済み・変更不要）

`describeRewardDisplay(amount, rewardsEnabled)` は、`rewardsEnabled` が `false` のとき `{ kind: "hidden" }` を返し、**金額に一切触れません**。

```ts
export function describeRewardDisplay(amount: number, rewardsEnabled: boolean): RewardDisplay {
  if (!rewardsEnabled) return { kind: "hidden" }; // 付与機能OFF。金額に触れない
  if (amount <= 0) return { kind: "not_eligible" };
  return { kind: "amount", amount };
}
```

Q8 の回答により `rewards_enabled=false` で凍結されるため、**「はじまりの旅」画面に OVE 金額は表示されません**。受入条件「Passport内部ポイントがOVEと表示されない」は、この経路については既に満たされています。本PRでは触りません。

### 2.2 撤去対象の現在の実装

`src/components/economy/OveWalletCard.tsx`（全46行）は次を表示しています。

- ラベル: `"OVE移行予定ポイント"` + `"(準備中)"`
- 値: `contributionPoints.toLocaleString()` + 単位 `"pt"`
- 注意書き: 「このポイントは現在、暗号資産ウォレットの残高ではありません。外部送金・換金はできません。将来のOVEへの移行条件・換算率は未確定です。」
- 獲得履歴: 直近3件（`entries.slice(0, 3)`）を `+N pt` 形式で表示

呼び出しは1箇所のみです。

```tsx
// src/app/(app)/page.tsx:193
{economy && <OveWalletCard contributionPoints={economy.contribution.total} entries={economy.activity} />}
```

`economy.contribution.total` は `src/lib/user-activity.ts:62` の `user.contribution_points` そのものです。

## 3. 変更予定ファイル

| # | ファイル | 変更 | 行数の目安 |
|---|---|---|---|
| 1 | `src/components/economy/OveWalletCard.tsx` | **削除** | −46 |
| 2 | `src/app/(app)/page.tsx` | import（18行目）と使用箇所（193行目）を削除 | −2 |
| 3 | `src/modules/ove-display-rules.test.ts` | **新規**。再発防止のソース走査テスト（§5.2） | +40 程度 |
| 4 | `docs/PR_P3_OVE_DISPLAY_PLAN_20260820.md` | 本計画（既存） | — |

**DB変更なし。API変更なし。他システムへの影響なし。**

### 3.1 撤去して情報が失われないことの確認

`OveWalletCard` が表示していた2つの情報は、**同一画面に既に別カードで存在します**。

| 失われる表示 | 同一画面の代替 | 行 |
|---|---|---|
| 総ポイント（`contribution.total`） | `<ContributionCard summary={economy.contribution} />` が「国家貢献ポイント / 総国家貢献」として表示。今月・今日も併記 | `page.tsx:162` |
| 獲得履歴 直近3件 | `<ActivityTimelineCard entries={economy.activity.slice(0, 5)} />` が直近5件を表示 | `page.tsx:194` |

したがって**新しいカードを作る必要はありません**。カードを1枚減らすだけで、条件3（正しい名称での表示）は既存コンポーネントが満たします。

### 3.2 コンポーネントを残さず削除する理由

将来の Wallet 残高カードは、`contribution_points` ではなく **Wallet API の応答**を入力に取り、取得中・成功・失敗の3状態を持つ別物です（§6）。現在の `OveWalletCard` は「`contributionPoints: number` を受け取って必ず1つの数値を描く」という、そのまま流用すると誤表示を再発させる形をしています。残しておく利点がないため削除します。

## 4. 変更後の表示文言

参加者トップ画面の該当領域は、次のようになります。

**変更前**

```
┌ 国家貢献ポイント ────────────┐
│  1,250      320       40      │
│  総国家貢献  今月      今日    │
└───────────────────────────────┘
        ⋮
┌ OVE移行予定ポイント(準備中) ─┐   ← 撤去
│  1,250 pt                     │
│  このポイントは現在、暗号資産  │
│  ウォレットの残高ではありません │
│  獲得履歴                      │
│   ガチャ         +10 pt        │
└───────────────────────────────┘
┌ 活動履歴 ────────────────────┐
│  …直近5件                     │
└───────────────────────────────┘
```

**変更後**

```
┌ 国家貢献ポイント ────────────┐
│  1,250      320       40      │
│  総国家貢献  今月      今日    │
└───────────────────────────────┘
        ⋮
┌ 活動履歴 ────────────────────┐
│  …直近5件                     │
└───────────────────────────────┘
```

**新規に追加する文言はありません。** 「OVE」という語が参加者画面から消えます。

### 4.1 参加者への影響と告知（要判断）

トップ画面からカードが1枚消えるため、「ポイントが無くなった」という問い合わせが起きうると考えます。実際には値（`users.contribution_points`）を一切変更せず、同じ数値が「国家貢献ポイント」カードに引き続き表示されます。

- 告知が必要かどうか、必要な場合の文面と掲出先（国家ニュース枠 / LINE）は**運営側でご判断ください**。
- こちらから告知文の案が必要であれば、別途ご用意します。

## 5. テスト項目

### 5.1 既存テストの非回帰

| 種別 | 内容 |
|---|---|
| `npm run test:unit` | 457件（現在すべて成功）。本PRはドメイン関数を変更しないため、件数・結果とも変化しない想定 |
| `npm run test:architecture` | 64件。`src/components` は対象外だが影響がないことを確認 |
| `npx tsc --noEmit` | `OveWalletCard` の import 削除漏れがあれば型エラーで検出される |
| `npm run lint` | エラー0を維持（既存の `no-img-element` warning 2件は本PRと無関係） |
| `npm run build` | 通過 |

### 5.2 新規テスト（再発防止）

`src/modules/ove-display-rules.test.ts` を追加します。`src/modules/architecture-rules.test.ts` と同じ「ソースを文字列として走査する」方式です。

| テスト | 内容 | 現状 |
|---|---|---|
| 1 | `src/` 配下のどのファイルも、`OVE` と `contribution` を**同時に含まない** | 現在の唯一の違反は `OveWalletCard.tsx`。削除後は0件 |
| 2 | `src/components` / `src/app` 配下に `OveWalletCard` への参照が残っていない | — |

テスト1は「国家貢献ポイントを OVE と結びつけて表示するコードを、将来また書けない」ことを機械的に保証します。走査対象から `docs/` とテストファイル自身は除外します。

> 除外規則を緩くしすぎると意味が無くなり、厳しすぎると Wallet接続PRで正当なコードが書けなくなります。Wallet接続PRでは Wallet API の応答を扱うため `contribution` を含まず、このテストに抵触しません。抵触するようになった時点で、それは設計が誤っている合図として扱います。

### 5.3 画面確認（ローカル）

| # | 確認内容 |
|---|---|
| 1 | 参加者トップに「OVE」という語が1つも出ない |
| 2 | 「国家貢献ポイント」カードが従来どおり総／今月／今日を表示する |
| 3 | 「活動履歴」カードが従来どおり直近5件を表示する |
| 4 | `/api/economy` が取得失敗したとき、従来どおりページ全体は表示され続ける（`page.tsx:112` のフォールバック） |
| 5 | 「はじまりの旅」進捗画面に OVE 金額が表示されない（`rewards_enabled=false`） |

### 5.4 このPRで実施しないテスト（Q7 回答により繰り延べ）

- Wallet 正常応答時の表示
- Wallet タイムアウト時の表示
- Wallet 404 時の表示
- 重複 `common_user_id` / `external_user_id` 時の表示

いずれも Wallet 接続PRで実施します。

## 6. Wallet 接続時の将来仕様（本PRでは実装しない）

将来の Wallet 残高カードが満たすべき契約を、ここに固定しておきます。**本PRではコードを書きません。**

### 6.1 表示状態は4つ。数値を出すのは1つだけ

```
type WalletBalanceDisplay =
  | { kind: "not_connected" }              // service_integrations 未発行 → カード自体を出さない
  | { kind: "loading" }                    // 取得中 → 数値を出さず、取得中と明示する
  | { kind: "unavailable"; reason: string } // タイムアウト/404/認証失敗 → 「残高を取得できませんでした」
  | { kind: "balance"; amount: number }     // Wallet が返した値のみ
```

### 6.2 守るべき規則

| # | 規則 | 理由 |
|---|---|---|
| 1 | `amount` の供給元は **Wallet API の応答のみ**。`contribution_points` を代入しない | 今回直す誤りの再発防止 |
| 2 | 取得失敗時に**前回値をキャッシュから復元して確定残高として出さない** | 指示書 PR-P3 の明示要求 |
| 3 | 取得中・失敗時は「OVE」という単位を付けた数値を一切描画しない | 「0 OVE」に見えると減額と誤解される |
| 4 | Wallet 未接続時はカード自体を出さない | 指示書 PR-P3 の明示要求 |
| 5 | 判定は純粋関数に置き、vitest で4状態すべてを検証する | 本リポジトリの既存方針 |

### 6.3 接続の前提（Q16 回答より）

Wallet 側の以下が完成するまで `service_integrations` は発行されず、接続PRは着手しません。

- `common_user_id` ベース残高API
- 認証方式の確定
- 競合時 409 契約
- staging テスト
- 監査ログ

現時点の Wallet 契約は `service_code` + `external_user_id` 方式です。接続PRでは**既存の `external_user_id` 方式を維持しつつ**、Wallet 側に追加予定の `common_user_id` 方式も併せて確認します。

## 7. ロールバック方法

| 項目 | 内容 |
|---|---|
| **条件** | 参加者から「ポイントが消えた」という問い合わせが想定を超えて発生した場合、または `ContributionCard` 側に表示不具合が見つかった場合 |
| **手順** | このPRの**revert 1回のみ**。`git revert <merge-commit>` で完全に元の表示へ戻る |
| **所要時間** | revert → CI → デプロイ。10〜15分程度 |
| **データ復旧** | **不要**。DB変更・データ変更を一切行わないため、失うものがない |
| **フラグによる停止** | 本PRには機能フラグを設けません。表示層のみでDB変更が無く、revert が即時かつ完全なため、フラグを足す方が構成を複雑にします |

> 指示書のロールバック方針は「コードを戻す前に機能フラグで新ガードまたはWallet表示を停止する」ですが、これは PR-P1a（書込みガード）と Wallet接続PR を想定した規定です。本PRは**表示要素の撤去のみ**で、止めるべき新機能も新しい書込みも存在しないため、フラグは設けず revert を唯一の手段とします。**この解釈で問題ないかご確認ください。**

## 8. 実施順序と前提

| 項目 | 状態 |
|---|---|
| 前提となるPR | PR #164 のマージと staging 適用（着手順序 1） |
| ブランチ | 既存の `claude/sengoku-economy-os-j0d2nl`。**新規ブランチは作成しません**（別ブランチが必要な場合はご指示ください） |
| 本計画の承認 | **未取得。承認後にコード変更を開始します** |

## 9. 確認をお願いしたい点

| # | 内容 |
|---|---|
| 1 | `OveWalletCard` を**削除**する方針（残さない理由は §3.2） |
| 2 | 代替カードを新設せず、既存の `ContributionCard` に委ねる方針（§3.1） |
| 3 | 参加者への告知の要否と、必要な場合の掲出先（§4.1） |
| 4 | 本PRに機能フラグを設けず、revert を唯一のロールバック手段とすること（§7） |
| 5 | PR #164 のマージ・staging 適用を待ってから着手すること |
