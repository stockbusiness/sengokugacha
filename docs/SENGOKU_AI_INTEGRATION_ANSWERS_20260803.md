# sengoku-ai.com 連携 照会と回答（2026-08-03）

「外部システム連携セットアップ手順（2026-08-03版）」および「外部開発者向け連携ガイド
v3.6.78-draft」を実装と突き合わせ、4点をsengoku-ai.com開発者へ照会した。
本書は回答内容と、それを受けた実装対応の記録である。

---

## Q1. common-users/resolve のパス

**照会**: 連携ガイド9.1章は `/api/common-users/resolve`、セットアップ手順6章は
`/api/v2/common-users/resolve` と記載が食い違っている。

**回答**:

> 正しい現行パスは `POST https://sengoku-ai.com/api/common-users/resolve` です。
> `/api/v2/common-users/resolve` は資料側の記載ミスです。
> 将来的に `/api/v2/...` を追加する場合でも、既存連携を壊さないため旧パスは当面併存する方針です。

**対応**: **実装変更なし。** 現行実装が既に正しいパスを使っていた。

---

## Q2. hierarchy.php のレスポンスフィールド名

**照会**: ガイド7.3章の例では識別子が `code`、階層が `level`、連絡先が `contact` の入れ子だが、
実装は `agent_code` / `role_level` / `contact_email` を読んでおり、資料通りなら1件も取り込めない。

**回答**（マスク済みの実レスポンス提示あり）:

```json
{
  "id": 10,
  "agency_id": "agent_7_8573",
  "internal_agent_id": 10,
  "code": "agent_7_8573",
  "name": "代理店名",
  "person_name": "担当者名",
  "level": 3,
  "role_label": "エージェント",
  "parent_id": null,
  "parent_agency_id": null,
  "parent_code": null,
  "status": "active",
  "lp_urls": [
    {
      "project_id": 1,
      "project_key": "sengoku-influencer",
      "project_slug": "sengoku-influencer",
      "project_name": "戦国インフルエンサー",
      "url": "https://sengoku-ai.com/a/agent_7_8573?project=sengoku-influencer"
    }
  ],
  "contact": { "email": "...", "phone": "...", "line_url": "..." },
  "children": []
}
```

> `include_contact=1` の場合、連絡先は `contact.email` / `contact.phone` / `contact.line_url` として返ります。
> 現在の実装では、`agent_code` / `role_level` / `contact_email` は標準レスポンス項目ではありません。
> 貴社側で `code` と `agent_code` の両対応にしていただく方針で問題ありません。

**これが今回最も重大な発見だった。** 既存の差分報告書は本APIを「一致」と判定していたが、
レスポンス例のフィールド名まで突き合わせておらず、**実際には代理店を1件も同期できない状態**だった。

**対応**: `src/modules/agency/domain/hierarchy.ts` を修正。

| 取り込み先 | 優先順に読む項目 |
|---|---|
| `external_id` | `code` → `agency_id` → `external_id` → `agent_code` |
| `parent_external_id` | `parent_code` → `parent_agency_id` → `parent_external_id` → ツリー上の親 |
| `role_level` | `level` → `role_level` |
| `contact_email` | `contact.email` → `contact_email` |
| `phone` | `contact.phone` → `phone` |
| `line_url` | `contact.line_url` → `line_url` |
| `contact_name` | `person_name` |
| `lp_urls` | `lp_urls`（従来は取り込んでいなかった） |

先方から両対応の了承を得ているため、旧名も引き続き受け付ける。資料改訂までの期間や、
将来の項目名変更でも同期が止まらないようにするため。

回答の実レスポンスをそのままテストケースに固定した
（`src/modules/agency/domain/hierarchy.test.ts`）。

---

## Q3. project_key に入れるべき値

**回答**:

> `project_key` は案件・商品・LPプロジェクトを識別するキーで、値は `projects[].slug` と同じです。
> （例: `sengoku-influencer`、`ai-art-school`）
>
> `referrals/confirm` では現行実装上は必須ではありません。紹介関係のプロジェクトは、基本的に
> `referral_token` または `referral_session_key` に紐づくプロジェクトから判定されます。
> そのため送らなかった場合でもエラーにはならず、トークンに紐づくプロジェクトに記録されます。
> ただし今後の商品追加・複数プロジェクト対応を明確にするため、送信可能な場合は併せて送ることを推奨します。
>
> 戦国パスポート側で使う値は、流入元LP・紹介URLが戦国インフルエンサー案件であれば
> `sengoku-influencer`。戦国パスポート自体を独立した商品・案件として扱う場合は、代理店システム側に
> `sengoku-passport` プロジェクトを登録したうえでその値を使う形になります。

**対応**: どの案件として送るかは運用判断のため、値を固定せず管理画面から設定できる形にした。

- `agency_integration_settings.default_project_key`（null許容）を追加
- 管理画面「代理店連携」に入力欄を追加
- `referrals/capture` と `referrals/confirm` に、設定済みのときだけ `project_key` を添える
- **未設定なら送らない**（先方の既定動作＝トークンに紐づく案件へ記録、に委ねる）

戦国パスポートを独立案件として登録するかは未決定のため、初期値は未設定としている。

---

## Q4. referrals/capture の存続

**回答**:

> `referrals/capture` は今後も利用可能です。現時点で廃止予定はありません。
> 現在の貴社実装（capture → session_key保持 → confirm）が推奨フローです。
>
> `capture` を使わない場合は、`confirm` に `session_key` を渡す必要はありません。
> その代わり `confirm` に `referral_token` を直接渡してください。
>
> ただし、流入ログや途中離脱も追跡したい場合は、引き続き `capture` を使う運用を推奨します。

**対応**: 推奨フローは維持したうえで、**capture失敗時のフォールバック**として実装した。

`captureReferral()` はfail-open（失敗してもログインを止めない）のため、ネットワーク障害や
先方の機能フラグ無効時には `referral_session_key` が得られない。従来はその場合に紹介確定を
何も行わず、**その利用者の代理店成果紐づけが永久に失われていた。**

- `users.referral_token`（null許容）を追加し、`?ref=` の生の値を登録時に保存
- `confirmReferral()` は `session_key` / `referral_token` のどちらかがあれば送信する
  （`session_key` があればそちらを優先。capture時点の流入情報に紐づくため文脈が多く残る）
- 登録確定（`src/lib/passport.ts`）と購入確定（`run-purchase-grant.ts`）の**両方**に適用

---

## 先方の資料側の修正予定（回答より）

- `/api/v2/common-users/resolve` の記載を `/api/common-users/resolve` に統一
- `hierarchy.php` のレスポンス例を現行実装に合わせる
- `project_key` は任意だが推奨であることを明記
- `referrals/capture` は継続利用APIとして明記

---

## 実装後に必要な確認

1. **階層同期の実地確認** — 管理画面「手動で階層を同期」を実行し、同期件数が
   sengoku-ai.com側の代理店数と一致すること。修正前は0件だったはずなので、
   ここが増えれば修正が効いたことの確認になる
2. **project_key の値の決定** — 戦国パスポートを独立案件として登録するか、
   戦国インフルエンサー案件として送るか。決まるまでは未設定（送信しない）で問題ない
3. **紹介フォールバックの確認** — capture失敗時のフォールバックは異常系のため、
   通常の試験では通らない。§5.6のLINE新規登録試験の際、意図的にcaptureを失敗させた
   ケースも試せると確実
