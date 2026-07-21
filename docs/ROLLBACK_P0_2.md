# 千ノ国パスポート P0-2 ロールバック手順

本リポジトリには正式なdownマイグレーション機構が無い(既存の全マイグレーションと同様)。ロールバックが必要な場合は以下の手順を推奨する。PRごとに独立してロールバック可能。

## ロールバック条件

以下のいずれかを検知した場合、該当PRのみを対象にロールバックを検討する。

- 購入・ガチャが不能になる
- 既存の石高・ガチャ券・国家貢献ポイント残高が意図せず変化する
- 決済の二重処理・権利の二重付与が発生する
- 代理店連携(sengoku-ai.com、既存の`/api/integrations/agencies`)のエラー率が上昇する
- 既存LINEログイン・国取りが停止する

## PR別ロールバック手順

### PR-A(#106): 購入権利付与のステップ冪等化+再実行排他制御

- コード: `git revert`でPR-Aのマージコミットを取り消す。
- DB: `drop table purchase_grant_steps;`。`agent_sales.purchase_id`列と`uq_agent_sales_purchase_id`インデックスは`alter table agent_sales drop column purchase_id;`で削除可能(インデックスは列削除時に自動削除される)。`purchases.grant_status`のcheck制約は、コードロールバック後に`processing`/`retrying`を使わなくなるため、制約自体は残しても実害は無い(値として使われなくなるだけ)。

### PR-B(#107): entitlements再入可能な状態管理+順序逆転対応

- コード: `git revert`。
- DB: `application_status`系4列・`reversal_status`系4列は`alter table entitlements drop column ...`で削除可能。`entitlement_pending_revocations`は`drop table`可能。**注意**: `entitlements.entitlement_id`のunique制約を`unique(source_system_key, entitlement_id)`からグローバル一意へ戻す場合、複数システムから同じ`entitlement_id`が採番されていた場合に制約違反で戻せない可能性がある(実接続実績が無い現時点では該当データは無い想定)。

### PR-C(#108): integration_inbox_eventsの原子的claim

- コード: `git revert`。ロールバック後は旧来のSELECT-then-UPDATE方式に戻る(バグ#5が再発するため、ロールバックする場合は代替の緩和策(送信元での再送間隔確保等)を検討すること)。
- DB: `claim_integration_inbox_event()`関数、`integration_inbox_events.claimed_at`列は削除可能。ただしPR-Dで関数シグネチャが変更されているため、PR-D以降を先にロールバックしてから本PRをロールバックすること(逆順ロールバックが必須)。

### PR-D(#109): X-Event-Version検証+Idempotency-Key/event_id不一致チェック

- コード: `git revert`。
- DB: `integration_inbox_events.event_version`列削除可能。`claim_integration_inbox_event()`をPR-C時点のシグネチャに戻す場合は、PR-Cのマイグレーション内容で再作成する必要がある。

### PR-E(#110): shopping_order_events複合unique化+nonceクリーンアップ

- コード: `git revert`。管理API(`/api/admin/integrations/sen-no-kuni-hub/cleanup-nonces`)も同時に無効化される。
- DB: `shopping_order_events`のunique制約を`event_id`単独に戻す場合、`source_system_key`列の値が実際に複数存在していると制約違反で戻せない可能性がある(現時点では実接続実績が無いため該当なしの想定)。`cleanup_expired_sen_no_kuni_hub_nonces()`関数は`drop function`可能。

### PR-F(#111): common_user.merged競合永続化+assigned_agent再解決基盤

- コード: `git revert`。管理API(`/api/admin/integrations/sen-no-kuni-hub/retry-agent-assignments`)も同時に無効化される。
- DB: `common_user_merge_conflicts`・`unresolved_agent_assignments`はいずれも`drop table`で削除可能(既存テーブルから参照されていないため、既存機能への影響なし)。

### PR-G(本PR): 純粋関数テスト追加+完了報告4文書作成

- コード・ドキュメントのみの変更。DB変更なし。`git revert`のみで完全にロールバック可能。

## ロールバック時の共通注意事項

- 各PRのDB変更は、それ以降のPRのマイグレーションが依存しているカラム・関数を含む場合がある(特にPR-C→PR-Dの`claim_integration_inbox_event()`関数シグネチャ変更)。ロールバックは**新しいPRから順に**行うこと。
- 全体統合対応(PR1-8)自体のロールバック手順は`docs/sen-no-kuni-integration-completion-report.md`の該当セクションを参照。P0-2は全体統合対応の上に積まれているため、全体統合対応自体をロールバックする場合はP0-2も含めて全てロールバックが必要。
- `/api/integrations/sen-no-kuni-hub`は実接続実績が無いため、ロールバックによる実データへの影響は現時点では想定されない。
