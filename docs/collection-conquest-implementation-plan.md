# カード収集型「国取り」× 城主経済圏 連携 実装計画

「戦国パスポート カード収集型『国取り』× 城主経済圏 連携実装指示書v1.0」に対応する実装計画。`docs/collection-conquest-current-state-audit.md`(現状監査)を踏まえて策定する。

## 0. 今回のスコープ判断

指示書12章は5フェーズ(P0〜P2+将来拡張)を定義しているが、範囲が非常に広い(全18章)。**今回は指示書自身がP0と位置付ける「フェーズ1: 国取りの収集ゲーム化確定」のみを実装対象とする。** フェーズ2(城解放・城図鑑)以降は、フェーズ1完了後に別途改めて実装計画を立てて着手する(指示書12章の意図どおり、小さく段階的に進める)。

理由:
- 指示書0.1・11-1が最優先事項として掲げる「既存データ・購入権利・ガチャ履歴を壊さない」を確実に守るには、まず低リスクな表示・分離修正(フェーズ1)から着手し、影響範囲を検証しながら進めるのが安全。
- フェーズ2以降(城解放条件、内覧連携、報酬受取箱、OVE台帳)は`castles`⇔`provinces`の接続という監査で判明した大きな設計ギャップに依存しており、フェーズ1で「国取り側の地ならし」を終えてから着手する方が手戻りが少ない。
- 指示書16章「実装時の禁止事項」の多くは表示・用語の混同防止に関するもので、フェーズ1で先に対応すべき事項である。

## 1. 実装対象(フェーズ1: 国取りの収集ゲーム化確定)

| # | 内容 | 監査結果を踏まえた対応方針 |
|---|---|---|
| 1-1 | 国取り進捗表示の改善(必須武将・獲得済み・未獲得の一覧) | 新規UI。判定ロジックは変更しない(`maybeConquerProvince()`のまま) |
| 1-2 | 国制覇条件の管理(DB設定可能化) | `conquest_rules`/`conquest_rule_warlords`を新設。**判定ロジックは条件テーブルが無い国では既存のハードコード動作にフォールバックし、既存60国の挙動を一切変えない**設計とする(後述4章) |
| 1-3 | 国制覇・地方制覇・天下統一の永続実績化 | **対応済み**(`user_provinces.is_conquered`、`achievements`)。追加実装なし、表示強化のみ |
| 1-4 | 国取りと城主権の分離表示 | UI文言・レイアウトの追加のみ(DB変更なし) |
| 1-5 | 史実城主・公式城主の分離表示 | `castles`に`historical_lord_summary`列を追加し、城詳細画面で公式城主(既存の有効な`castle_lord_contracts`)と別枠表示 |
| 1-6 | OVEウォレット名称変更・注意表示 | `OveWalletCard.tsx`の文言変更のみ(DB変更なし) |
| 1-7 | 対戦・シーズン関連UIの非表示 | 調査の結果、該当UIは元々存在しないため対応不要 |

## 2. 実装対象外(今回)

- フェーズ2(城解放・城図鑑・内覧導線連携)、フェーズ3(報酬受取箱・OVE移行予定ポイント台帳)、フェーズ4(御城印・重複武将交換・城主コンテンツ承認)
- フェーズ5(指示書自身が「現時点では実装しない」と明記: OVE実ウォレット、PvP、シーズン制等)
- `castles`⇔`provinces`の本格的な関連テーブル(`castle_province_relations`)の新設 — フェーズ2着手時に改めて設計する(城の`region`自由入力text とprovincesの地方区分の突き合わせが必要になるため、フェーズ1には含めない)
- 武将の人物ID・カードバリエーション統合(`warlord_persons`) — 監査4-10のとおり、現行スキーマは1国3体固定で当該概念が発生しないため、今回は見送る

## 3. DB変更

新規マイグレーション(`supabase/migrations/`、`YYYYMMDDHHNNNN_snake_case.sql`)。

1. **`conquest_rules` / `conquest_rule_warlords`**(国制覇条件の管理)
   - `conquest_rules`: `id, province_id(FK unique), rule_type(check: 'all_specified'固定, 将来拡張時に追加), required_count nullable, min_rarity nullable, is_active boolean default true, created_at, updated_at`
   - `conquest_rule_warlords`: `rule_id(FK), warlord_id(FK), is_required boolean default true`
   - 初期データ投入なし(既存60国は行が存在しない=フォールバック動作)。管理画面から明示的に作成した国のみ`conquest_rules`が参照される。
   - `rule_type`はMVPでは`'all_specified'`(指示書6-3の条件種別1「指定武将をすべて1種類以上保有」)のみサポートし、他の条件種別(N種類以上・レアリティ閾値・図鑑登録率・AND/OR)は`rule_type`の値を追加する形で将来拡張できるようスキーマの余地を残すが、今回は実装しない。
2. **`castles`へ`historical_lord_summary text nullable`を追加**(史実城主情報。指示書3-1の用語定義に対応)

## 4. ロジック変更

- `src/lib/gacha.ts` の `maybeConquerProvince(userId, provinceId)`:
  - `conquest_rules`に`province_id`の行が存在し`is_active=true`の場合のみ、`conquest_rule_warlords`から対象武将一覧を取得して判定する。
  - 行が存在しない場合は**既存のロジック(`warlords`テーブルの当該国3体を全部所持)にフォールバック**し、挙動を一切変えない。
  - この二段構えにより、既存60国のユーザー実績データ・判定結果に影響を与えずに新しい条件エンジンを追加できる(監査11章「移行リスク」への対応)。
- 条件変更時の再計算: 指示書6-3「条件変更で既に制覇した国を原則未制覇へ戻さない」に従い、`conquest_rules`更新APIは`user_provinces.is_conquered=true`の行を自動的に取り消さない。取り消しが必要な場合は管理者の明示操作(理由必須)のみで行う専用APIを別途用意する。

## 5. API変更

- `GET /api/admin/conquest-rules` / `POST /api/admin/conquest-rules` / `PATCH /api/admin/conquest-rules/:id` — 国制覇条件のCRUD(`requireManagerRole()`でガード。財務影響はないが、ゲーム進行に関わるため本部管理者限定とする)
- `GET /api/conquest/provinces/:id/progress` — 必須武将・獲得済み・未獲得の内訳を返す(1-1のUI用、既存の`getProvinceProgress()`を拡張)
- `PATCH /api/admin/castles/:id` に`historical_lord_summary`を追加項目として含める(既存エンドポイントの拡張)

## 6. 画面変更

- `/regions`、`/map`: 必須武将・獲得済み・未獲得の一覧表示を追加
- `/admin/conquest-rules`(新規): 国制覇条件の一覧・編集画面(`castle-lord-contracts`管理画面のUIパターンを踏襲)
- `/castles/[castleId]`: 史実城主(`historical_lord_summary`)と公式城主パートナー(有効な`castle_lord_contracts`)を明確に別セクションで表示。「公式城主が史実上の城主である」ように見える表示を避ける(指示書6-7・16章)
- `src/components/economy/OveWalletCard.tsx`: 表示名を「OVE移行予定ポイント」へ変更し、送金・換金不可・換算率未確定の注意書きを追加

## 7. 移行計画

- `conquest_rules`は新規テーブルで初期データを入れないため、既存データへの移行作業は不要(フォールバック設計のため)。
- `castles.historical_lord_summary`はnullable追加のため既存行への影響なし。初期値は空欄運用とし、必要に応じて管理画面から個別に入力する(一括データ移行は対象外)。

## 8. テスト計画

- `src/lib/gacha.ts`の`maybeConquerProvince()`について、以下をvitestで検証する。
  - `conquest_rules`が存在しない国 → 既存動作(3体全部所持で制覇)と完全に同じ結果になること
  - `conquest_rules`が存在し`is_active=true`の国 → `conquest_rule_warlords`の対象武将のみで判定されること
  - `is_active=false`の国 → フォールバック動作に戻ること
- 管理画面での条件変更操作が、既存の`user_provinces.is_conquered=true`行を変更しないことを確認する統合テスト手順を`docs/collection-conquest-test-report.md`に記載する。

## 9. ロールバック

- `conquest_rules`/`conquest_rule_warlords`はフォールバック設計のため、行を作らなければ機能自体が発火しない。問題が発生した場合は該当国の`conquest_rules.is_active`を`false`に更新するだけで即座に旧動作へ戻せる。
- `castles.historical_lord_summary`は表示専用の追加列のため、ロールバックは列を無視するだけで良い(削除不要)。

## 10. 機能フラグ

このコードベースに汎用機能フラグの仕組みは無い(監査4章)。今回も同じ方針を踏襲し、`conquest_rules.is_active`という個別boolean列で新機能のON/OFFを国単位に制御する。

---

*関連ドキュメント: `docs/collection-conquest-current-state-audit.md`、`docs/featureinventory.md`*
