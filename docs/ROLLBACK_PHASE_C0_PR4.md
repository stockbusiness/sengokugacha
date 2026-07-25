# 千ノ国パスポート Phase C-0 PR4 ロールバック手順

PR #147の内容を本番へ適用した後、問題が見つかった場合のロールバック方針。`docs/ROLLBACK_BUGFIX.md`・`docs/ROLLBACK_P0_2.md`と同じ考え方(既存の正常な処理経路には触れず、追加した経路だけを無効化・削除できるようにする)を踏襲する。

## ロールバック判断基準

以下のいずれかを検知した場合、該当機能のみを無効化する。

- 購入・ガチャが不能になる
- 既存残高(kokudaka/gacha_tickets)が意図せず変化する
- 管理画面の復旧操作(retry-grant/retry-resolve/drain)が正常な行まで巻き込んで失敗させる
- 新規HMAC連携(`/api/integrations/sen-no-kuni-hub`)の受信が正しく処理されない
- §12の権限修正(`20260809000009`)適用後、正規のサーバー側処理(service role経由)がRPC呼び出しで失敗する

## §12(最重要): `20260809000009_revoke_public_execute_on_functions.sql`のロールバック

この修正は`public`スキーマの全カスタム関数から`PUBLIC`のEXECUTE権限を剥奪し、`service_role`にのみ付与するものである。アプリケーションコードは全てサーバー側`service_role`キー経由でRPCを呼ぶため、正常な状況では本番機能に影響しないはずだが、万一「サーバー側処理がRPC呼び出しで`permission denied`になる」障害が発生した場合は、以下の切り戻しSQLを本番DBへ直接適用する。

```sql
grant execute on all functions in schema public to public;
alter default privileges in schema public grant execute on functions to public;
```

**重要**: この切り戻しは§12で修正した権限の脆弱性(anon/authenticatedからの残高改ざん等)を再び開けることになるため、恒久対応ではなく一時的な緊急措置としてのみ用いること。切り戻した場合は`service_role`のGRANTが正しく機能しているか(`20260809000001_grant_service_role_privileges.sql`の内容)を優先的に調査し、原因を特定してから再度EXECUTEを剥奪すること。

## §6/§8: fencing(claim_token/lease_expires_at)のロールバック

`integration_inbox_events`/`integration_outbox_events`/`notification_outbox_events`へ追加した`claim_token`・`lease_expires_at`列は、既存の必須列(`status`等)に依存しない追加列であるため、削除しても既存データは失われない。ロールバックする場合は該当マイグレーションの逆操作(列のdrop、旧シグネチャの関数への戻し)を新規マイグレーションとして追加する。**マイグレーションファイル自体を直接書き換えたり削除したりしない**(Supabase local/本番の両方で適用済み履歴と食い違うため)。

## §4: entitlement revoke/grantのバグ修正(`20260809000004`〜`20260809000006`)のロールバック

これらは既存の`process_entitlement_grant()`/`process_entitlement_revocation()`のロジック修正であり、テーブル構造の変更は伴わない(§4修正分)。問題が発生した場合は、該当関数を修正前のロジックへ戻す新規マイグレーションを追加する。ただし、修正前のロジックには「entitlement再送が永久に復旧不能になる」バグがあったため、単純な切り戻しは推奨しない。

## §8: 管理画面drainルートのclaim機構追加のロールバック

`src/app/api/admin/integration-outbox/drain/route.ts`の変更(claim→送信→mark)は、`IntegrationOutboxRepository`に追加した新メソッド(`claimForDrain`/`markDrainSent`/`markDrainFailed`)のみを使用しており、既存の`markSent`/`markFailed`(購入直後の即時送信フローが使用)は変更していない。ロールバックする場合はこのファイルのみをgit revertすればよく、他の経路への影響は無い。

## 影響範囲の切り分けが容易な設計であることの確認

Phase C-0 PR4で追加した機能はいずれも既存の正常処理経路(Stripe Webhook本体、entitlement受信、integration inbox/outbox、gacha抽選本体)へ「原子性・排他制御」を追加するものであり、業務ロジック自体(誰にいくら付与するか等)を変更していない。そのため、各修正はマイグレーション・対応するTypeScript変更ファイル単位で独立してrevert可能であり、他の§の内容に影響を与えない。
