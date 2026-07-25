# 千ノ国パスポート マイグレーション事前確認結果

`tests/migrations/duplicate-checks.sql`(§5.2)・`tests/migrations/run-preflight.sh`(Phase C-0 PR4 §11)・`scripts/production-migration-preflight.sql`(同)が対象とする、unique制約追加前の重複行チェックの実行結果を記録する。`scripts/test-migrations.sh`のコメントで「このファイルへ報告すること」と参照されていたドキュメント。

## 対象のunique制約

| テーブル | 制約対象カラム | 追加したマイグレーション |
|---|---|---|
| `achievements` | `(user_id, achievement_type)` | `20260808000006_gacha_draw_atomic.sql` |
| `purchase_grant_steps` | `(purchase_id, step_key)` | `20260807000002_purchase_grant_steps.sql`(作成時から) |
| `entitlements` | `(source_system_key, entitlement_id)` | `20260807000003_entitlements_reentrant.sql` |
| `integration_inbox_events` | `(source_system_key, event_id)` | `20260805000001_sen_no_kuni_hub_basis.sql`(作成時から) |
| `stripe_webhook_events` | `stripe_event_id` | `20260803000001_stripe_safety_p0.sql`(作成時から) |

いずれも本PR4より前のフェーズで追加済みの制約であり、今回のPR4で新たに追加したunique制約は無い(§12で追加した`revoke execute`は権限変更でありunique制約ではない)。本ドキュメントは、これらの制約が「既存データ相当」の非空DBに対しても正しく機能する(=誤検知しない)ことの事前確認結果である。

## 実行結果1: 空DBに対する実行(§5.1/§5.2、`scripts/test-migrations.sh`)

`supabase db reset`直後の空DBに対して`duplicate-checks.sql`を実行した場合、5テーブル全てで0件(重複無し)が返る。ただし空DBでは重複が存在しようがないため、この結果だけでは制約・クエリの正しさを実証できない(既知の限界)。

## 実行結果2: 既存データ相当フィクスチャに対する実行(§11、`tests/migrations/run-preflight.sh`)

`tests/migrations/fixtures/pre_phase_c0.sql`で、5テーブルそれぞれに複数行(一部は意図的にキーの一部だけを共有する行を含む。例: 同じ`entitlement_id`だが異なる`source_system_key`)を投入した状態で`duplicate-checks.sql`を実行。

このセッションで、開発用サンドボックスに一時的にPostgreSQL 16クラスタを起動し、`supabase/migrations/`配下の全72マイグレーションを空DBへ適用した上で実際に投入・実行した結果:

```
--- achievements: (user_id, achievement_type) 重複チェック ---
(0 rows)
--- purchase_grant_steps: (purchase_id, step_key) 重複チェック ---
(0 rows)
--- entitlements: (source_system_key, entitlement_id) 重複チェック ---
(0 rows)
--- integration_inbox_events: (source_system_key, event_id) 重複チェック ---
(0 rows)
--- stripe_webhook_events: stripe_event_id 重複チェック ---
(0 rows)
```

全て0件。フィクスチャには「同じ値の一部だけが重複するがキー全体では重複しない」行を意図的に含めているため、この結果はクエリのGROUP BY対象カラムが正しい(誤検知しない)ことも同時に裏付けている。

## 実行結果3: 検出力の確認(誤って0件を返し続けるだけのクエリでないことの確認)

上記フィクスチャ投入後のDBに対し、`achievements`のunique制約を一時的に外した上で意図的に重複行(同一`user_id`・同一`achievement_type`の2行目)を挿入し、同じクエリを再実行した結果:

```
--- achievements duplicate check (should now show 1 duplicate row) ---
               user_id                |   achievement_type    | count
--------------------------------------+------------------------+-------
 1be4334a-9a1e-4764-80dc-349b907606da | region_complete_kanto  |     2
```

意図した通り1件の重複(count=2)が検出された。確認後は`ROLLBACK`で制約緩和・挿入行を破棄し、DBを元の状態(重複0件)に戻した上でクラスタを停止・削除した。

## 結論

- 現時点の`supabase/migrations/`に含まれるunique制約は、既存データ相当の(複数行・複数キーが混在する)データセットに対しても誤検知せず、かつ実際の重複を正しく検出できることを確認した。
- 本番DBへの適用前には、`scripts/production-migration-preflight.sql`(読み取り専用)を実際の本番相当DBに対して実行し、同様に0件であることを確認すること。1件でも重複が見つかった場合は、件数・原因・正とする行の決定方法・統合方針・ロールバック方法・既存機能への影響を本ドキュメントへ追記してから対応すること(自動での削除・統合は行わない)。
- 本番での事前確認はこのセッションでは実施できていない(本番DBへの接続手段が無い、指示書の方針により意図的に接続しない)。**7. 未対応**(`docs/IMPLEMENTATION_STATUS_PHASE_C0_PR4.md`の区分)。本部担当者による実施が必要。
