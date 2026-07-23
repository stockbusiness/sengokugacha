# 千ノ国パスポート モジュール化後バグ修正 実装履歴

`SEN_NO_KUNI_PASSPORT_POST_MODULARIZATION_BUGFIX_INSTRUCTIONS.md`の提出物。PRごとの変更内容を記録する。

## 確認基準コミット

`6afffe28d587f99a5b05f637bb9f2c276e6ef2f9`(モジュール化最終成果物マージ直後)。

## PR1: fix: atomically claim purchase grant steps

**対象**: Phase A-1(§4.3.1)

**変更ファイル**:
- `supabase/migrations/20260808000001_purchase_grant_step_atomic_claim.sql`(新規)
  - `purchase_grant_steps`へ`claim_token uuid`・`lease_expires_at timestamptz`列を追加
  - `status`のcheck制約に`processing`・`dead`を追加(既存: `pending`/`completed`/`failed`)
  - `claim_purchase_grant_step(p_purchase_id, p_step_key, p_lease_seconds default 300, p_max_attempts default 10)`: SELECT ... FOR UPDATEによる原子的claim。戻り値`claim_outcome`は`claimed`/`already_completed`/`in_progress`/`dead`のいずれか。
  - `mark_purchase_grant_step_completed(p_step_row_id, p_claim_token)`: claim_token一致時のみ`completed`へ更新、成功可否をbooleanで返す。
  - `mark_purchase_grant_step_failed(p_step_row_id, p_claim_token, p_error)`: 同上、`failed`へ更新。
- `src/lib/purchase-grants.ts`(変更)
  - `runStep()`を上記3関数を呼び出す実装へ全面的に書き換え。既存の呼び出し元(`runPurchaseGrant()`内の各`runStep(...)`呼び出し)のシグネチャ・呼び出し方は変更なし。

**設計判断**:
- `claim_integration_inbox_event()`(P0-2 §4.5、`20260807000004_integration_inbox_atomic_claim.sql`)と同じ「SELECT ... FOR UPDATE + 動的SQLを使わない状態遷移判定」の設計方針を踏襲した。
- 既存の`claim_integration_inbox_event()`には無い「claim_token(fencing token)」を新規に導入した。これは今回の指示書が明示的に要求している設計(§4.3.1「同じpurchase_id + step_keyを複数処理が同時に実行できないこと」、§6.2「claim_tokenが一致しない古いworkerは更新不可」)であり、既存のintegration inboxとの差分として意図的なもの(既存inboxのfencing対応は今回のスコープ外)。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint` / `npx vitest run`(150/150、変更なし) / `npm run build` 全て通過。DB統合テストは未実施(前提を参照)。

## PR2: fix: make balance grants transactional and idempotent

**対象**: Phase A-1(§4.3.2)

**変更ファイル**:
- `supabase/migrations/20260808000002_purchase_balance_grant_transactional.sql`(新規)
  - `apply_purchase_balance_grant(p_purchase_id, p_user_id, p_column, p_delta)`: `claim_purchase_grant_step(p_purchase_id, 'balance_granted')`をネスト呼び出しし、claim成功時のみ`users.kokudaka`/`users.gacha_tickets`を`greatest(0, col + delta)`で加算した上で`mark_purchase_grant_step_completed()`を呼ぶ。全体が単一トランザクション。
  - `record_purchase_agent_sale(p_purchase_id, p_user_id, p_item_type, p_amount)`: 同様に`claim_purchase_grant_step(p_purchase_id, 'agent_sale_recorded')`をネスト呼び出しし、`agent_sales`への記録(`on conflict (purchase_id) where purchase_id is not null do nothing`で冪等)とステップ完了記録を単一トランザクションで行う。
- `src/lib/purchase-grants.ts`(変更)
  - `grantPurchase()`(削除)・`recordAgentSaleIfReferred()`(削除)を、上記2つのPostgres関数を呼び出す`applyBalanceGrantStep()`/`recordAgentSaleStep()`へ置き換え。`runPurchaseGrant()`内の呼び出しを`runStep(supabase, ..., () => grantPurchase(...))`パターンから直接呼び出しへ変更。
  - 未使用になった`adjustUserBalance`のimportを削除(`entitlements.ts`/`refund/route.ts`/`user-activity.ts`では引き続き使用しているため、`atomic-balance.ts`自体は変更していない)。

**設計判断**:
- Postgres関数の中から別のPostgres関数(`claim_purchase_grant_step()`)を呼び出す場合、ネストされた呼び出しは外側の呼び出しと同一トランザクションで実行される(plpgsqlに自律トランザクションは無い)。この性質を利用し、「claim検証→副作用→ステップ完了記録」の3手順を、途中失敗時に全体がロールバックされるひとつの原子的な単位として実現した。PR1で導入したclaim機構を再利用しつつ重複実装を避けている。
- `apply_purchase_balance_grant()`は`p_column`を`'kokudaka'`/`'gacha_tickets'`のいずれかにcheckで制限し、動的SQL(`EXECUTE`)は使わない(既存の`adjust_user_balance()`と同じ設計方針)。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint` / `npx vitest run`(150/150、変更なし) / `npm run build` 全て通過。DB統合テストは未実施(前提を参照)。
