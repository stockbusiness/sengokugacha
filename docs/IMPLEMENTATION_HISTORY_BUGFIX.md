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

## PR3: fix: atomically apply and reverse entitlements

**対象**: Phase A-2(§5)

**変更ファイル**:
- `supabase/migrations/20260808000003_entitlement_atomic_claim.sql`(新規)
  - `entitlements`へ`application_claim_token`/`application_lease_expires_at`/`reversal_claim_token`/`reversal_lease_expires_at`列を追加。
  - `application_status`のcheck制約に`applying`・`dead`、`reversal_status`のcheck制約に`reversing`・`dead`を追加。
  - `claim_entitlement_application(p_entitlement_row_id, ...)`/`claim_entitlement_reversal(p_entitlement_row_id, ...)`: `claim_purchase_grant_step()`と同じ設計(SELECT ... FOR UPDATE、claim_tokenによるfencing)。
  - `process_entitlement_grant(p_entitlement_row_id)`: 行ロックを取得し、`user_id`が未解決なら`common_user_id`から再解決を試み(解決できれば`entitlements.user_id`を更新)、`claim_entitlement_application()`をネスト呼び出しした上で残高加算+`application_status`更新を単一トランザクションで行う。
  - `process_entitlement_revocation(p_entitlement_row_id)`: 同様に`claim_entitlement_reversal()`をネスト呼び出しし、`application_status='applied'`の場合のみ残高減算+`reversal_status`更新を行う。
- `src/lib/entitlements.ts`(変更)
  - `handleEntitlementGranted()`/`handleEntitlementRevoked()`の残高操作ロジックを、上記2つのPostgres関数を呼び出す形に簡略化。
  - `BALANCE_ENTITLEMENT_COLUMNS`(TS側の残高カラムマッピング)・`adjustUserBalance`の直接呼び出しを削除(判定・操作ともSQL側へ移設)。
  - `EntitlementRow`/`ENTITLEMENT_ROW_SELECT`を`id`のみに簡略化(呼び出し元でid以外のフィールドを使わなくなったため)。

**設計判断**:
- PR2と同じ「ネストされた関数呼び出しは同一トランザクション」の性質を利用し、「行ロック→user_id再解決→claim→残高操作→状態更新」を単一の原子的な単位として実現した。
- `user_id`の再解決(§5.5)は、entitlement受信イベントが再送されるたびに(=`process_entitlement_grant()`が呼ばれるたびに)自動的に試行される。ただし、送信元からの自発的な再送が来ない限りは再解決の機会が発生しないため、管理画面からの手動トリガー(§5.5後半)は別途必要(未対応事項として記録)。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint` / `npx vitest run`(150/150、変更なし) / `npm run build` 全て通過。DB統合テストは未実施(前提を参照)。

## PR4: fix: atomically claim Stripe webhook inbox events

**対象**: Phase A-3(§6)

**変更ファイル**:
- `supabase/migrations/20260808000004_stripe_webhook_event_atomic_claim.sql`(新規)
  - `stripe_webhook_events`へ`claim_token uuid`・`claimed_at timestamptz`・`lease_expires_at timestamptz`列を追加。
  - `status`のcheck制約に`dead`を追加(既存: `pending`/`processing`/`succeeded`/`failed`)。
  - `claim_stripe_webhook_event(p_stripe_event_id, p_event_type, p_payload, p_claim_token, p_lease_seconds default 300, p_max_attempts default 10)`: 行が無ければ`ON CONFLICT DO NOTHING`で作成した上で`SELECT ... FOR UPDATE`により原子的にclaimする。戻り値`claim_outcome`は指示書§6.2の仕様通り`new`/`retryable`/`duplicate`/`in_progress`/`dead`のいずれか。`claim_token`は呼び出し側が生成して渡す(指示書§6.2の関数シグネチャに明記)。
  - `mark_stripe_webhook_succeeded(p_inbox_event_id, p_claim_token)`/`mark_stripe_webhook_failed(p_inbox_event_id, p_claim_token, p_error)`: PR1と同じfencingパターン(claim_token一致時のみ更新、成功可否をbooleanで返す)。
- `src/app/api/stripe/webhook/route.ts`(変更)
  - 既存inbox実装(`stripe_webhook_events`のSELECT→`decideStripeInboxAction()`による判定→INSERT/UPDATEという複数DB往復)を、`claim_stripe_webhook_event()`の単一RPC呼び出し+`mark_stripe_webhook_succeeded()`/`mark_stripe_webhook_failed()`へ置き換えた。`claim_token`は`crypto.randomUUID()`で生成する。
  - `claim_outcome`が`duplicate`/`in_progress`/`dead`のいずれの場合も200(`received: true`)を返す。`in_progress`は他リクエストの処理完了を待たせず終える設計、`dead`はStripe側の自動再送に頼らず管理画面からの手動再実行(全体統合対応PR3)に委ねるためログ記録のみ行い200を返す。
- `src/modules/commerce/domain/stripe-inbox.ts`・`stripe-inbox.test.ts`(削除)
  - モジュール化(PR12)で抽出した純粋関数`decideStripeInboxAction()`は判定ロジックがSQL側(`claim_stripe_webhook_event()`)へ完全移設されたため、呼び出し元が無くなり削除した。
- `docs/MODULE_BOUNDARIES.md`(変更)
  - `stripe-inbox.ts`の行を削除し、Postgres関数への統合経緯を注記として追加。

**設計判断**:
- PR1(`claim_purchase_grant_step`)と同じ「`SELECT ... FOR UPDATE`+動的SQLを使わない状態遷移判定+claim_tokenによるfencing」の設計を踏襲した。既存実装(SELECT→アプリ側で分岐→INSERT or UPDATE、という複数のDB往復)は、SELECTとその後の書き込みの間に他リクエストが割り込む余地があり、同一Stripe eventの並行到達(手動再送と自動再送の重複等)で二重に`processing`へ進み得たが、単一のPostgres関数内で行ロックを取得したまま状態遷移を完結させることでこれを解消した。
- 指示書§6.2の関数シグネチャが`claim_token`を引数として明記していたため、PR1/PR3(関数内部で生成して返す方式)とは異なり、本PRでは呼び出し側でトークンを生成して渡す方式を採用した。fencingの安全性(claim_tokenが一致する呼び出しのみが完了・失敗を記録できる)自体はどちらの方式でも同じ。
- `claim_stripe_webhook_event()`内の行作成(`insert ... on conflict (stripe_event_id) do nothing`)は`for update`より前に実行するため、行が存在しない初回呼び出しでも同一トランザクション内で作成直後にロックを取得できる。これにより指示書§6.3の「unique違反がHTTP 500にならない」を満たす(万一の競合はDB側の行ロックで直列化され、呼び出し元にunique制約違反が伝播することはない)。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint` / `npx vitest run`(144/144、`decideStripeInboxAction()`のテスト5件削除に伴い150→144。他は変更なし) / `npm run build` 全て通過。DB統合テストは未実施(前提を参照)。

## PR5: feat: support HMAC signature v2 alongside v1

**対象**: Phase A-3(§7)

**変更ファイル**:
- `supabase/migrations/20260808000005_sen_no_kuni_hub_signature_v2.sql`(新規)
  - `sen_no_kuni_hub_settings`へ`v1_disabled_at timestamptz`・`v1_last_used_at timestamptz`・`v1_usage_count bigint not null default 0`列を追加。
  - `record_sen_no_kuni_hub_v1_usage(p_key_id text)`: `v1_usage_count`を単一UPDATE文で原子的にインクリメントし`v1_last_used_at`を更新する(read-modify-writeを避けるため、`adjust_user_balance()`等と同じ設計方針)。
- `src/modules/integrations/domain/sen-no-kuni-hub-signature.ts`(新規)・`sen-no-kuni-hub-signature.test.ts`(新規)
  - `resolveSignatureVersion(header)`: `X-SenNoKuni-Signature-Version`ヘッダーの値を`"1"`/`"2"`/`null`(不正値)へ正規化する純粋関数。省略時は`"1"`を返す(既存接続の後方互換)。
  - `buildV1SignedPayload(timestamp, rawBody)`: 既存v1署名対象文字列(`timestamp + "." + rawBody`)を構築する。
  - `buildV2CanonicalString({keyId, timestamp, nonce, eventVersion, idempotencyKey, rawBody})`: 指示書§7.2の推奨canonical string(`key_id\ntimestamp\nnonce\nevent_version\nidempotency_key\nsha256(raw_body)`)を構築する。
  - `isV1SignatureAllowed(v1DisabledAt, now)`: システム単位でv1署名がまだ許可されているかを判定する純粋関数。
  - テストで上記4関数のロジックを検証(nonce/Idempotency-Key/event_version/key_id/raw_bodyの各要素を変更するとcanonical stringが変化することを含む、§7.4の必須検証のうちunit test化可能な部分)。
- `src/lib/sen-no-kuni-hub-auth.ts`(変更)
  - `verifySenNoKuniHubRequest()`が`X-SenNoKuni-Signature-Version`ヘッダーで署名バージョンを判定し、v1/v2それぞれに応じた署名対象文字列で検証するよう変更。v2の場合は`X-Event-Version`/`Idempotency-Key`ヘッダーの存在も必須にする(欠落時は`missing_headers`エラー)。
  - `settings.v1_disabled_at`を参照し、期限を過ぎたシステムのv1署名を`v1_disabled`エラーで拒否する。
  - v1署名でのリクエスト成功時、`record_sen_no_kuni_hub_v1_usage()`をベストエフォートで呼び出し利用ログを記録する(失敗してもリクエスト自体は成功させる)。
  - `SenNoKuniHubAuthErrorCode`に`invalid_signature_version`・`v1_disabled`を追加。`SenNoKuniHubIdentity`に`signatureVersion`を追加(既存呼び出し元`route.ts`は`systemKey`のみ参照しているため後方互換)。
- `docs/MODULE_BOUNDARIES.md`(変更): `sen-no-kuni-hub-signature.ts`の行を追加。

**設計判断**:
- 契約書のバージョン別名(§00_COMMON_INTEGRATION_CONTRACT.md)のうち署名対象文字列の全システム合意がDRAFT段階で未確定だったため、モジュール化時点のP0-2では既存v1実装を維持する方針を取っていた(`docs/BASELINE_TEST_RESULTS.md`参照)。今回のバグ修正指示書§7で具体的なv2仕様が明示されたため、v1を破壊せず併存させる形でv2を追加した。
- v2のraw_bodyをそのままcanonical stringへ連結すると、本文中の改行文字等でフィールド境界が曖昧になり得るため、指示書の推奨仕様通りsha256ハッシュ値(hex)を連結する設計とした。
- `v1_disabled_at`は「システム単位の許可バージョン設定」(§7.3)と「v1停止日時を決定」(§7.3)を1つの列で兼ねる設計にした。未設定(null)ならv1を無期限に許可し(既存接続を破壊しない)、値を設定すればその日時以降v1を拒否する。ロールバックは列をnullに戻すだけで済む(§7.3「ロールバック可能にする」)。
- 「新規連携はv2必須」(§7.3)はDB制約では強制せず、新規`sen_no_kuni_hub_settings`行作成時に`v1_disabled_at`をnow()に設定する運用上の取り決めとして扱うこととした(接続時点で「新規」かどうかをスキーマから機械的に判定する手段が無いため)。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint` / `npx vitest run`(159/159、`sen-no-kuni-hub-signature.test.ts`の新規テスト15件追加に伴い144→159) / `npm run build` 全て通過。DB統合テストは未実施(前提を参照)。
