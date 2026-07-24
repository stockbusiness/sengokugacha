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

## PR6: fix: make gacha draws transactionally safe

**対象**: Phase A-4(§8)

**変更ファイル**:
- `supabase/migrations/20260808000006_gacha_draw_atomic.sql`(新規)
  - `gacha_daily_usage`(新規テーブル): 日次上限の原子的な確認・予約用。`unique(user_id, business_date, draw_type)`。
  - `gacha_logs`へ`request_id uuid`(部分unique index)・`is_new_card`・`province_conquered`・`region_completed`・`region_completion_bonus`・`contribution_points_earned`列を追加。
  - `achievements`へ`unique(user_id, achievement_type)`制約を追加。
  - `execute_gacha_draw(p_user_id, p_draw_type, p_business_date, p_daily_limit, p_selected_province_id, p_selected_warlord_id, p_conquered_provinces_count_at_draw, p_request_id)`: 指示書§8.3の9手順(日次上限確認・予約→ガチャ券消費→`user_warlords`upsert→`gacha_logs`追加→国家貢献ポイント加算→国制覇判定→実績upsert→地方ボーナス加算→commit)を単一トランザクションで実行する。`request_id`による冪等リプレイに対応。
- `src/modules/gacha/domain/draw-limit.ts`(変更)・`draw-limit.test.ts`(変更)
  - `getTokyoBusinessDate(now: Date): string`を追加。`Intl.DateTimeFormat`の`Asia/Tokyo`タイムゾーンで"YYYY-MM-DD"を算出する純粋関数(§8.5)。JST日付境界のロールオーバーをunit testで検証。
- `src/lib/gacha.ts`(全面改修)
  - `performDraw()`: 国・スロット・武将の決定(排出率tier参照)はTS側に残し、その結果を`execute_gacha_draw()`へ渡して書き込み側を単一トランザクション化した。日次上限は事前の`COUNT`クエリ(`getTodaysDrawCount`、削除)ではなく、SQL関数内の原子的な確認・予約に一本化した。
  - `addWarlordToUser()`/`maybeConquerProvince()`/`recordAchievementOnce()`/`grantKokudakaBonus()`/`maybeCompleteRegion()`(旧実装、それぞれread-modify-writeまたはSELECT→INSERTのレースを含んでいた)を削除し、`execute_gacha_draw()`呼び出しに置き換えた。
  - 動画演出の選定(`selectAnimationForDraw`)は、`execute_gacha_draw()`が返す`is_new_card`を使い、コミット後にベストエフォートで実行・記録する(既存方針「演出選定の失敗でガチャ自体を失敗させない」を維持)。
  - `GachaLimitExceededError`/`InsufficientTicketsError`は、SQL関数が`raise exception`する`gacha_daily_limit_exceeded`/`insufficient_gacha_tickets`(既存の`consume_gacha_ticket()`由来)を`error.message`で判定して変換する(既存の`consumeGachaTicket()`ラッパーと同じ変換パターン)。
- `src/modules/gacha/domain/rarity.ts`・`rarity.test.ts`(削除)
  - `calcContributionPoints()`(スロット別基礎点+新規カードボーナス)のロジックを`execute_gacha_draw()`内のSQLへ移設したため、TS側の呼び出し元が無くなり削除した。
- `src/modules/conquest/domain/conquest-policy.ts`・`conquest-policy.test.ts`(削除)
  - `isConquestSatisfied()`(必須武将の充足判定)のロジックを`execute_gacha_draw()`内のSQL(所持数と必須数の比較)へ移設したため、TS側の呼び出し元が無くなり削除した。`src/lib/conquest-rules.ts`の re-export も削除。
- `src/lib/user-activity.ts`(変更)
  - `gacha_draw`アクティビティの記録は`execute_gacha_draw()`内で直接行うようになったため、`recordContribution()`を経由しなくなった旨をコメントで明記した(関数自体は他のアクティビティ種別で引き続き使用)。
- `docs/MODULE_BOUNDARIES.md`(変更): 上記削除・統合を反映。

**設計判断**:
- 指示書§8.3の関数シグネチャ例(`selected_province_id`/`selected_warlord_id`/`contribution_points`等を引数に取る)は、抽選そのもの(排出率tier・動画アセット等のDB設定に依存する読み取り専用処理)をアプリ側で行い、その決定結果を反映する書き込み側のみをSQL関数に閉じ込める設計を示唆していると解釈した。ただし`contribution_points`は`isNewCard`(SQL関数内で`xmax = 0`により確定)に依存するため、TS側で事前計算せず関数内で算出する設計に変更した(`calcContributionPoints()`のロジックをSQLへ移設)。同様に動画演出選定も`isNewCard`に依存するため、SQL関数の外(コミット後)で行う設計とした。
- `user_warlords`の新規獲得判定は、追加の読み取りクエリを挟まずに`INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING (xmax = 0)`という単一SQL文で行う(新規insert行かどうかを示す標準的なPostgresイディオム)。
- 国制覇条件判定(`conquest_rules`優先、無ければ「その国の武将を全部所持」にフォールバック)・地方コンプ実績のスラグ変換(`REGION_SLUGS`)・石高ボーナス計算(`KOKUDAKA_BONUS_PER_PROVINCE`)は、いずれも既存TS実装(`src/lib/gacha.ts`の削除済み関数群、`src/modules/conquest/domain/region-completion.ts`)と完全に同じロジックをSQLへ複製した。`region-completion.ts`自体は`src/lib/regions.ts`の`getRegionProgress()`(地方進捗の読み取り専用表示)が引き続き利用するため削除していない。SQL側のコメントに「両者を同期させること」を明記した。
- `request_id`はPR1/PR3/PR4のfencing token(claim_token)とは異なり、呼び出し側(TS)が生成して渡す設計とした(指示書§8.3の関数シグネチャに`request_id`が引数として明記されているため、PR4のStripe inbox原子的claimと同じ判断)。

**未対応の残存事項・既知の制約**: `docs/IMPLEMENTATION_STATUS_BUGFIX.md`のPR6セクションに記載の通り、選出可能国一覧のTOCTOU(既存実装から変更なし、実害は限定的)、`xmax = 0`イディオムの実地未確認、`date`型RPCパラメータの実地未確認、`achievements`への新規unique制約適用前の重複データ確認が必要である旨を記録した。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint` / `npx vitest run`(152/152、`draw-limit.test.ts`へ3件追加・`rarity.test.ts`5件と`conquest-policy.test.ts`5件を削除、159→152) / `npm run build` 全て通過。DB統合テストは未実施(前提を参照)。本PRはガチャという中核機能への大規模な変更であり、通常のP0修正PRより慎重なコードレビューを行った(SQL側のロジックが既存TSロジックと1対1で対応することを個別に確認済み、詳細は本セクションの「設計判断」を参照)。

## PR7: fix: require manager role for integration-recovery admin actions

**対象**: §9(管理画面権限修正)

**変更ファイル**:
- `supabase/migrations/20260808000007_integration_recovery_soft_resolve.sql`(新規)
  - `common_user_merge_conflicts`・`unresolved_agent_assignments`へ`resolved_at timestamptz`・`resolved_by text`・`resolution_note text`列を追加。
- `src/app/api/admin/integrations/sen-no-kuni-hub/cleanup-nonces/route.ts`・`retry-agent-assignments/route.ts`(変更)
  - `requireManagerRole()`を追加し、managerロールでない場合は403を返す。
- `src/app/api/admin/integrations/sen-no-kuni-hub/merge-conflicts/[id]/resolve/route.ts`(変更)
  - `requireManagerRole()`を追加。対象行のDELETEを、`resolved_at`/`resolved_by`/`resolution_note`を設定するUPDATEに変更。既に`resolved_at`が設定済みの行への再操作は409で拒否する(冪等な多重クリック対策)。`logAdminAction()`の`before`/`after`に更新前後のスナップショットを記録。リクエストボディの任意の`resolutionNote`を記録できるようにした。
- `src/app/api/admin/integrations/sen-no-kuni-hub/unresolved-agent-assignments/[id]/dismiss/route.ts`(変更)
  - 上記と同じ変更(`resolve`→`dismiss`)。
- `src/app/api/admin/integrations/sen-no-kuni-hub/merge-conflicts/route.ts`・`unresolved-agent-assignments/route.ts`(変更)
  - 一覧取得(GET)を`resolved_at is null`で絞り込むよう変更。DELETEからUPDATEへの変更に伴い、解決・却下済みの行が一覧に残り続けないようにするため。
- `src/app/admin/(dashboard)/integration-recovery/page.tsx`(変更)
  - `handleResolveMergeConflict()`/`handleDismissUnresolvedAssignment()`が、失敗時にサーバーの`error`メッセージ(403時の「本部管理者のみ実行できます」等)を表示するよう変更(`cleanup-nonces`/`retry-agent-assignments`の既存ハンドラと同じパターンに揃えた)。

**設計判断**:
- 指示書§9の対象4APIのうち、`cleanup-nonces`/`retry-agent-assignments`は単一行への操作ではない(nonce一括削除・複数行の再試行)ため、`requireManagerRole()`の追加のみとし、soft-resolve化の対象外とした。`merge-conflicts/resolve`/`unresolved-agent-assignments/dismiss`の2つは単一行の恒久的な状態変更のため、soft-resolve化(DELETE→UPDATE)を適用した。
- `resolved_at`が既に設定されている行への再操作を409で拒否するのは、指示書に明記された要件ではないが、DELETEからUPDATEへ変更したことで「既に処理済みの行に対して誤って再度resolve/dismissを押す」という新しい操作ミスの可能性が生まれたため、防御的に追加した(元のDELETE実装では2回目の呼び出しは「対象が見つからない」という形で自然に無害化されていたが、UPDATEでは対象行が存在し続けるため、明示的なガードが必要と判断した)。
- `unresolved_agent_assignments`の自動解決経路(`handleAssignedAgentUpdated()`が成功時に該当行を自己削除する、`src/lib/agency-events.ts`)は指示書§9の対象4API に含まれないため変更していない(引き続きハードDELETE)。管理者による手動判断(dismiss)のみをsoft-resolve化の対象とした。

**未対応の残存事項**: `resolutionNote`の入力UIは`/admin/integration-recovery`画面に追加していない(APIはリクエストボディで受け取れるが、現状のUIからは送信されない)。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint` / `npx vitest run`(152/152、変更なし。本PRは認可チェック追加とDB操作の変更のみでunit test化可能な新規純粋ロジックは無い) / `npm run build` 全て通過。DB統合テストは未実施(前提を参照)。

## PR8: fix: persist unresolved events for not-yet-synced users

**対象**: §10(未同期ユーザーイベント保持)

**変更ファイル**:
- `supabase/migrations/20260808000008_unresolved_common_user_merges.sql`(新規)
  - `unresolved_agent_assignments.reason`のcheck制約に`user_not_found`を追加(既存: `agent_code_undetermined`/`agent_not_found`)。
  - `unresolved_common_user_merges`(新規テーブル): `source_common_user_id`/`target_common_user_id`/`payload`/`reason`(check: `source_user_not_found`)/`status`(check: `pending`/`resolved`)/`attempt_count`/`last_error`/`created_at`/`updated_at`/`resolved_at`。`unique(source_common_user_id, target_common_user_id)`。
- `src/lib/agency-events.ts`(変更)
  - `handleAssignedAgentUpdated()`: `common_user_id`に対応するローカルユーザーが見つからない場合、これまで`return`のみだった箇所を`recordUnresolvedAgentAssignment(..., "user_not_found", body)`で保存するよう変更。
  - `handleCommonUserMerged()`: 統合元(source)のローカルユーザーが見つからない場合、これまで`return`のみだった箇所を新規ヘルパー`recordUnresolvedCommonUserMerge()`で`unresolved_common_user_merges`へ保存するよう変更。統合成功パス(通常の付け替え、および統合先競合でconflictテーブルへ記録するパスの両方)の末尾で新規ヘルパー`markUnresolvedCommonUserMergeResolved()`を呼び、対応する`unresolved_common_user_merges`行(存在する場合のみ)を`status='resolved'`へ更新するようにした。
- `src/app/api/admin/integrations/sen-no-kuni-hub/unresolved-common-user-merges/route.ts`(新規)
  - `unresolved_common_user_merges`の一覧取得(`status='pending'`のみ)。
- `src/app/api/admin/integrations/sen-no-kuni-hub/retry-common-user-merges/route.ts`(新規)
  - `requireManagerRole()`で保護。`status='pending'`の全行に対し`handleCommonUserMerged(row.payload)`を再実行する(既存`retry-agent-assignments`と同じ「全件再試行」パターン)。失敗時は`attempt_count`をインクリメントし`last_error`を記録する(頻度の低い管理操作のため、read-modify-writeによる原子性の欠如は許容する設計判断)。
- `src/app/admin/(dashboard)/integration-recovery/page.tsx`(変更)
  - 「未解決のcommon_user統合イベント」セクションを追加(一覧表示+「全件再解決を試行」ボタン、既存の「未解決の担当代理店割当」セクションと同じUIパターン)。`REASON_LABEL`に`user_not_found`/`source_user_not_found`のラベルを追加。

**設計判断**:
- 新設ルート`retry-common-user-merges`は指示書§9の対象4API明示リストには含まれないが、既存ルートと同じ「連携復旧操作」カテゴリであるため一貫性のため`requireManagerRole()`を最初から適用した。
- `handleCommonUserMerged()`の統合先競合パス(target側に既に別ユーザーが割当済み)でも`markUnresolvedCommonUserMergeResolved()`を呼ぶようにした。これは「統合元ユーザーが同期された」という当初の未解決理由(`source_user_not_found`)が解消されたことを示すためであり、統合先競合という別の問題(`common_user_merge_conflicts`で別途追跡)が残っていても、`unresolved_common_user_merges`側の記録としては役目を終えたと判断した。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint` / `npx vitest run`(152/152、変更なし。本PRはDB依存のイベント処理・新規APIルートのみでunit test化可能な新規純粋ロジックは無い) / `npm run build` 全て通過(新規ルート`retry-common-user-merges`/`unresolved-common-user-merges`がビルド出力に含まれることを確認)。DB統合テストは未実施(前提を参照)。

## PR9: fix: move external purchase side effects to outbox

**対象**: §4.3.3(Phase A-1残: 外部副作用のoutbox化)

**変更ファイル**:
- `supabase/migrations/20260808000009_purchase_outbox.sql`(新規)
  - `integration_outbox_events`(全体統合対応PR5で新設・これまで呼び出し元が無かった)へ`source_type`/`source_id`列(NOT NULL)を追加し、`unique(source_type, source_id, event_type, target_system_key)`制約を追加。
  - `notification_outbox_events`(新規テーブル): `source_type`/`source_id`/`event_type`/`target_system_key`(default `'line'`)/`payload`/`status`(pending/sent/failed)/`attempt_count`/`last_error`/`created_at`/`sent_at`、同じunique制約。
- `src/lib/integration-outbox.ts`(全面書き換え)
  - 旧実装(`source_type`/`source_id`を持たず`integration_outbox_events`専用、呼び出し元皆無)を、`OutboxTable`(2テーブル)をパラメータとして受け取る汎用実装へ置き換え。`enqueueOutboxEvent()`(unique制約違反`23505`検知による冪等insert)・`markOutboxSent()`・`markOutboxFailed()`・`listPendingOrFailedOutboxEvents()`を追加。
- `src/lib/common-user-hub.ts`(変更)
  - `confirmReferral()`の戻り値を`Promise<void>`から`Promise<boolean>`(`postToAgencySystem()`の結果が`null`でないか)へ変更。
- `src/lib/castle-notifications.ts`(変更)
  - `notifyPlotPurchase()`を`sendBestEffort()`(ログのみで例外を握りつぶす)経由から`pushMessage()`直接呼び出しへ変更し、戻り値を`Promise<boolean>`(実際に送信を試みたか)へ変更。送信失敗時は例外をそのまま呼び出し元(`purchase-grants.ts`)へ伝播させる(他の通知関数`notifyContractTransition`/`notifyCommissionConfirmed`/`notifyCommissionReversed`は変更なし、`sendBestEffort`のfail-open方針を維持)。
- `src/lib/purchase-grants.ts`(変更)
  - `confirmReferralForPurchase()`を、送信前に`integration_outbox_events`へenqueueし、`confirmReferral()`の戻り値に応じて`markOutboxSent`/`markOutboxFailed`を呼ぶ実装へ書き換え。
  - 新設`notifyPlotPurchaseViaOutbox()`: `notification_outbox_events`へのenqueue→`notifyPlotPurchase()`呼び出し→結果記録(例外時も`markOutboxFailed`で捕捉)。`runPurchaseGrant()`の`land_plot`分岐で`notifyPlotPurchase()`直接呼び出しからこの関数経由へ変更。
- `src/app/api/admin/integration-outbox/route.ts`(新規)
  - `GET`: 2テーブルの未送信・失敗イベント一覧を返す(`getAdminSession()`のみ、読み取り専用のため他の一覧系routeと同じ認可レベル)。
- `src/app/api/admin/integration-outbox/drain/route.ts`(新規)
  - `POST`: `requireManagerRole()`で保護。2テーブルの未送信・失敗イベントを再送し(`event_type`別に`confirmReferral()`/`notifyPlotPurchase()`を呼び分け)、結果を記録・監査ログに記録する。Cron等のバックグラウンドジョブ基盤が無いため、既存の`retry-agent-assignments`等と同じ「管理者トリガーによる全件再試行」方式を踏襲。
- `src/app/admin/(dashboard)/integration-recovery/page.tsx`(変更)
  - 「購入イベント外部送信(未送信・失敗)」セクションを追加(一覧表示+「全件再送を試行」ボタン、既存の各セクションと同じUIパターン)。

**設計判断**:
- `confirmReferral()`/`notifyPlotPurchase()`を「例外を投げるよう変更する」のではなく「戻り値でboolean結果を返す」設計にしたのは、両関数の「主処理(購入・登録)を絶対に止めない」という既存のfail-open方針そのものは維持しつつ、新規の呼び出し元(outbox経由の`purchase-grants.ts`)だけが送信結果を検知できるようにするため。他の既存呼び出し元(`confirmReferral()`の`passport.ts`)は戻り値を使用しないため、この変更は非破壊的である(grepで確認済み)。
- `src/lib/integration-outbox.ts`(全体統合対応PR5で新設)は、grepで確認した通り呼び出し元が一つも無い未使用コードだったため、削除して作り直すのではなく既存ファイルの内容を全面的に置き換える形にした(`stripe-inbox.ts`削除(PR4)・`rarity.ts`/`conquest-policy.ts`削除(PR6)と同じ「完全に置き換わった既存基盤コードは残さない」という本バグ修正シリーズの一貫方針)。
- `notifyPlotPurchaseViaOutbox()`は、LINE未連携等の「送信対象外」ケース(`notifyPlotPurchase()`が`false`を返す)も`markOutboxSent()`で「送信済み」扱いにする。これは「対象外」を再送しても意味が無いためだが、結果として「実際に送信を試みて失敗した」ケースとの区別がステータス上つかない(いずれの理由でも最終的に`sent`または`failed`に収束する)。

**検証**: `rm -rf .next && npx tsc --noEmit` / `npm run lint`(0 errors, 2 warnings、既存の`<img>`警告のみ) / `npx vitest run`(152/152、変更なし。本PRは外部副作用の記録経路変更のみでunit test化可能な新規純粋ロジックは無い) / `npm run build` 全て通過(新規ルート`/api/admin/integration-outbox`・`/api/admin/integration-outbox/drain`がビルド出力に含まれることを確認)。DB統合テストは未実施(前提を参照)。
