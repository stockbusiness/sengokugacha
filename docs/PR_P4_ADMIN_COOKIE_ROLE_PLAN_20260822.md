# PR-P4 実装計画 — roleなし旧管理Cookie の manager フォールバック廃止

- 作成日: 2026-08-22
- 対象: `stockbusiness/sengokugacha`（Passport）
- 準拠: `01_PASSPORT_IMPLEMENTATION_INSTRUCTIONS_20260820.md` PR-P4、**Q13 案(a)**、2026-08-22 のご判断 §8
- 起点: `main` = `2d5882e`
- 範囲: **Q13 案(a)（①のみ）**。②③は今回対象外
- **Draft PR 作成までは承認済み。本番デプロイは別途 Go 確認後。**

---

## 1. 何を直すか

`src/lib/admin-session.ts:56-64`

```ts
// 旧セッション(2ロール導入前に発行されたCookie)にはadminRoleクレームが無いため、
// その場合は互換のため「本部管理者」として扱う(以前は全員が同じ権限だったため)。
export async function getAdminRole(): Promise<AdminRole | null> {
  ...
  return payload.adminRole === "operator" ? "operator" : "manager";
}
```

最終行が問題です。`payload.adminRole` が **`undefined`（クレーム自体が無い）でも `manager` を返します**。

2ロール導入前に発行された Cookie を持つ利用者は、**operator であるべき場合でも manager 権限を得ます**。受入条件「roleなし旧管理Cookieで manager 権限を取得できない」に反しています。

### 修正後

```ts
// PR-P4。adminRole クレームが無い Cookie は manager として扱わない。
// 2ロール導入前に発行された Cookie が manager 権限を得られる状態だったため。
// 未知の値・欠落はすべて operator へ倒す(fail-closed)。
return payload.adminRole === "manager" ? "manager" : "operator";
```

**変更は1行です。** `manager` と明示されている場合だけ manager とし、それ以外（`operator` / 未知の値 / 欠落）はすべて operator に倒します。

---

## 2. 影響

### 2.1 誰が影響を受けるか

`adminRole` クレームの**無い** Cookie を持っている管理者だけです。

| 状態 | デプロイ後 |
|---|---|
| `adminRole: "manager"` の Cookie | 影響なし |
| `adminRole: "operator"` の Cookie | 影響なし |
| **クレームが無い Cookie** | **manager 操作が 403 になる** |

`setAdminSessionCookie()` の既定は `adminRole: "manager"` なので、**再ログインすれば直ちに解消します**。

### 2.2 いつ自然解消するか

Cookie の有効期間は12時間です。誰も再ログインしなくても、**最大12時間で全員が解消**します。

### 2.3 manager 操作とは

403 になるのは、`requireManagerRole()` を通る操作です。主なものは次のとおりです。

- 支払処理（`POST /api/admin/payouts`）
- 報酬の確定（`/api/admin/commission-ledger/confirm-matured`）
- 土地区画購入の返金（`/api/admin/purchases/[id]/refund`）
- entitlement の再解決（`/api/admin/entitlements/retry-resolve`）
- Outbox の手動再送

閲覧は operator でも可能なため、**画面が真っ白になることはありません**。実行ボタンだけが 403 になります。

---

## 3. 変更するもの

| # | ファイル | 内容 |
|---|---|---|
| 1 | `src/lib/admin-session.ts` | `getAdminRole()` の1行。コメントも更新 |
| 2 | `src/modules/admin-session-role.test.ts`（新規） | ロール判定の単体テスト |

**変更しないもの**：ログイン処理、Cookie の発行、`setAdminSessionCookie()` の既定値、共有パスワード方式そのもの（②③は対象外）。

---

## 4. 検証

| # | 内容 |
|---|---|
| 1 | `adminRole: "manager"` → `manager` |
| 2 | `adminRole: "operator"` → `operator` |
| 3 | **クレーム欠落 → `operator`**（本PRの要） |
| 4 | 未知の値（`"admin"` / `""` / `null` / 数値）→ `operator`（fail-closed） |
| 5 | `role` が `admin` でない → `null` |
| 6 | Cookie 無し → `null` |
| 7 | 署名不正・期限切れ → `null` |
| 8 | `requireManagerRole()` が 1 でのみ true |
| 9 | 既存の contract テスト（manager / operator の 403 判定）が非回帰 |

**意図的に壊して落ちることを確認**してから提出します。特に3を `manager` に戻した状態でテストが落ちることを確認します。

---

## 5. デプロイ手順（ご指定の条件を反映）

実施時間帯は **22:00〜23:00（日本時間、管理業務終了後）** とご指定いただきました。

| # | 手順 | 担当 |
|---|---|---|
| 1 | 管理者へ「再ログインが必要になる可能性がある」旨を事前通知 | 運営 |
| 2 | デプロイ前に、管理操作中の担当者がいないことを確認 | 運営 |
| 3 | **Go の合図をいただく** | 運営 |
| 4 | PR をマージ（＝ Vercel が本番デプロイ） | 運営 |
| 5 | 管理者がログアウト → 再ログイン | 運営 |
| 6 | `adminRole` クレームが付与されていることを確認（§5.1） | 運営 |
| 7 | manager 操作の正常性を確認（§5.2） | 運営 |
| 8 | 問題があれば新規デプロイを停止し、原因を確認 | 双方 |

**マージ＝本番デプロイ**である点にご注意ください。Go の合図をいただくまで、PR はドラフトのままにしておきます。

### 5.1 クレーム付与の確認方法

ログアウト → 再ログイン後、**manager 専用操作が通ること**をもって確認とします。Cookie の中身を直接見る必要はありません（JWT の値をチャットや記録へ貼らないでください）。

### 5.2 確認していただきたい操作

| # | 画面 | 操作 | 期待 |
|---|---|---|---|
| 1 | `/admin/castle-payouts` | 支払ボタンが押せる（対象0件なら「対象の確定済み報酬がありません」が出る） | 403 にならない |
| 2 | `/admin/castle-commissions` | 確定ボタンが押せる | 403 にならない |
| 3 | `/admin/operations-health` | Outbox の手動再送が押せる | 403 にならない |
| 4 | 任意の閲覧ページ | 従来どおり表示される | 変化なし |

1 で「対象の確定済み報酬がありません」（400）が出るのは**正常**です。403 でなければ権限は通っています。

### 5.3 ロールバック

| 手段 | 内容 |
|---|---|
| 第1 | **全員がログアウト → 再ログイン**すれば、コードを戻さずに解消します（クレーム付きの Cookie が発行されるため） |
| 第2 | それでも問題が続く場合、この1行を revert して再デプロイ |
| データ | DB 変更はありません。復旧作業は不要 |

**第1で解決するのが通常です。** この変更は「クレームの無い古い Cookie を信用しない」だけなので、新しい Cookie を配れば元の操作性に戻ります。

---

## 6. 今回やらないこと（Q13 の②③）

| 項目 | 理由 |
|---|---|
| ② 自己申告名でなく認証済み管理者IDを監査ログに記録 | ③が前提。個別アカウントが無いと「認証済み管理者ID」自体が存在しない |
| ③ 共有パスワードから個別アカウントへの移行 | 管理者認証基盤の作り直し。新規テーブル、招待/発行フロー、パスワードリセット、既存運用者への移行案内が必要 |

現在は共有パスワード2本（manager 用・operator 用）のみです。②③を行う場合は別プロジェクトとして計画を立てます。

---

## 7. 作業範囲

ご判断 §8 のとおり、**実装・テスト・Draft PR 作成まで**を行います。

**マージと本番デプロイは行いません。** Go の合図をいただいてから、上記 §5 の手順で進めます。
