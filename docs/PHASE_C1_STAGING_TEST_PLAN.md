# 千ノ国パスポート Phase C-1 ステージング試験計画書

「千ノ国パスポート Phase C-1: ステージングDB適用・外部接続・運用復旧試験指示書」(以下「指示書」)への対応計画。基準コミット `a20375808818888188b26b9a2283ca9c9e5c9f4c`(PR #147マージ後の`main`)。

## 0. 前提条件の確認結果(最重要・更新版)

ユーザーより「現在のSupabase・Vercelはまだ実稼働していないため、新規環境は作らずこれをステージングとして使う」との指示を受けた。実際、リポジトリの`.env.local`に現行のSupabase接続情報(`NEXT_PUBLIC_SUPABASE_URL=https://vutnjxswfamluicsxwwi.supabase.co`・`SUPABASE_SERVICE_ROLE_KEY`)が存在することを確認した。

しかし、この接続情報を使って実際に接続を試みたところ、**このコーディングセッションのネットワークegressプロキシにより`403 Forbidden: Host not in allowlist`で拒否される**ことを確認した(`vutnjxswfamluicsxwwi.supabase.co`が組織のegress許可リストに含まれていない)。さらに、プロキシの制約文書(`/root/.ccr/README.md`)には「raw-TCP databases」への接続はプロキシ経由でサポートされないと明記されており、これは**migration適用・`production-migration-preflight.sql`の実行に必須の生Postgres接続(psql)が、このセッションからは(allowlist許可の有無に関わらず)原理的に不可能**であることを意味する。

このため、指示書の10ステップのうち、実際の外部接続・DB接続を要する作業(migration履歴取得・preflight実行・migration適用・RPC権限のSQLでの直接確認・Vercelデプロイ確認・LINE/ガチャ/Stripe/HMAC/entitlement/outboxの実環境接続試験)は、**このセッションから直接実行することができない**。

これを踏まえ、ユーザーの了承のもと、以下の方針で進める。

- 生SQL(psql)を要する手順(migration履歴取得・preflight実行・migration適用)は、**`stockbusiness`が手元またはSupabase SQL Editor等、実際にネットワーク到達可能な環境で実行するための実行手順書(本書2章)を提供**し、実行結果をこのセッションへ共有してもらう。
- HTTPS接続で完結する外部接続試験(§6〜§13相当)は、既存の`tests/contracts/*.test.ts`・`tests/integration/*.test.ts`を、現行Supabase/Vercelの接続情報に向けて`stockbusiness`の環境で実行してもらうことで代替する(このセッションでは同様に`Host not in allowlist`で実行できない)。
- 実行結果(psqlの出力・テスト結果)を共有いただければ、このセッション側で`docs/PHASE_C1_MIGRATION_RESULTS.md`等の5文書を実測結果として更新する。

## 1. ステージング(現行Supabase/Vercel)実行手順書 — `stockbusiness`実施用

### 1.1 準備

```bash
# Supabase CLIのインストール(未導入の場合)
npm install -g supabase

# プロジェクトのDB接続文字列を取得
# Supabaseダッシュボード → 対象プロジェクト → Settings → Database → Connection string
# 「Session pooler」または「Direct connection」のURIをコピーする(以下 $STAGING_DATABASE_URL とする)
```

### 1.2 手順1: 現在のmigration履歴を取得

```bash
psql "$STAGING_DATABASE_URL" -c "select version, name from supabase_migrations.schema_migrations order by version;"
```

このリポジトリの`supabase/migrations/`と突き合わせ、未適用のファイルを特定する(想定では`20260809000004`以降の7ファイルが未適用のはず)。

### 1.3 手順2: DBバックアップ手順

Supabaseダッシュボード → 対象プロジェクト → Database → Backups から、手動バックアップ(Point-in-time recoveryが有効なプランならスナップショット地点の確認のみでも可)を取得する。無料プランでダッシュボードからの手動バックアップが無い場合は、`pg_dump`で代替する。

```bash
pg_dump "$STAGING_DATABASE_URL" -Fc -f "backup_$(date +%Y%m%d_%H%M%S).dump"
```

### 1.4 手順3: preflightを読み取り専用で実行

```bash
psql "$STAGING_DATABASE_URL" -f scripts/production-migration-preflight.sql | tee preflight_result.txt
```

**1件でも異常(重複行・orphan・null不整合・10分以上processing・anon/authenticatedが実行可能な関数)があれば、migrationを適用せずこの時点で結果を共有してほしい。**

### 1.5 手順4: 未適用migrationの確認

```bash
ls supabase/migrations/*.sql | xargs -n1 basename | sort
# 1.2で取得した既適用一覧と比較し、未適用ファイルを特定
```

### 1.6 手順5: migration適用

```bash
# 方法A: Supabase CLI(推奨、migration履歴テーブルも自動更新される)
supabase link --project-ref vutnjxswfamluicsxwwi
supabase db push

# 方法B: psqlで手動適用(7ファイルをtimestamp順に)
for f in 20260809000004_fix_entitlement_revocation_premature_reversed.sql \
         20260809000005_entitlement_grant_respects_dismissal.sql \
         20260809000007_integration_inbox_atomic_claim_fencing.sql \
         20260809000008_outbox_atomic_claim_fencing.sql \
         20260809000009_revoke_public_execute_on_functions.sql \
         20260810000001_entitlement_grant_auto_reverses_when_already_revoked.sql \
         20260810000002_event_trigger_locks_down_new_functions.sql; do
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/$f"
done
```

適用は`postgres`ユーザー(接続文字列に含まれるロール)で行う。

### 1.7 手順6: RPC権限確認

```bash
psql "$STAGING_DATABASE_URL" -c "
select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
where n.nspname = 'public'
order by 1, 2;
"
```

anon/authenticatedが全関数で`false`、service_roleが`true`であることを確認する。

### 1.8 手順7: Vercel最新デプロイの確認

```bash
# Vercel CLI未導入の場合
npm install -g vercel
vercel login
vercel ls   # プロジェクト一覧からデプロイ状況を確認
vercel inspect <deployment-url>  # 最新デプロイの詳細
```

または、Vercelダッシュボードで対象プロジェクトの最新デプロイが`main`の最新コミット(`a20375808818888188b26b9a2283ca9c9e5c9f4c`以降)に対応していることを確認する。

### 1.9 手順8: LINE・ガチャ・Stripe・HMAC・entitlement・outbox試験

既存のcontract/integrationテストを、現行Supabase/Vercelの接続情報に向けて実行する。**実データが作成・削除されるため、実行前に必ずバックアップ(1.3)を取得済みであることを確認すること。**

```bash
# .env.localの現行値をそのまま使う(NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)
# 加えて、テストが参照する以下を現行環境向けに設定する
export SUPABASE_TEST_URL="https://vutnjxswfamluicsxwwi.supabase.co"
export SUPABASE_TEST_SERVICE_ROLE_KEY="<.env.localのSUPABASE_SERVICE_ROLE_KEY>"
export SUPABASE_TEST_ANON_KEY="<Supabaseダッシュボードから取得したanon key>"
export DATABASE_TEST_URL="$STAGING_DATABASE_URL"

npm run test:integration   # §7(ガチャ)・§10(entitlement)・§11(outbox)相当
npm run test:contracts     # §8(Stripe、test mode前提)・§9(HMAC v1/v2)・§13(管理画面)相当
```

**注意**: `tests/integration/support/env.ts`の`requireLocalTestUrl()`は`localhost`/`127.0.0.1`以外への接続を拒否するガードが入っている(誤って本番へ接続することを防ぐ安全装置)。現行Supabaseはこのガードに引っかかるため、ステージング実行時は一時的にこのガードを外す必要がある。**この変更は実行後に必ず元に戻し、コミットしないこと**(安全装置を恒久的に外さない)。

LINEログイン(§6)は自動テスト化できないため、LIFF実機での手動QAが別途必要(`docs/PHASE_C1_CONNECTION_RESULTS.md`のチェックリスト参照)。Stripeは必ずtest mode鍵(`sk_test_...`)を使用し、本番キーは絶対に使用しないこと。

### 1.10 手順9: rollback試験

`docs/PHASE_C1_ROLLBACK_RESULTS.md`の「ステージングでの実施」章の4項目(Vercel Instant Rollback・processingデータ検知・event trigger無効化/再有効化・outbox処理中の切り戻し)を、上記1.6でmigration適用したステージング環境に対して実施する。

### 1.11 結果の共有

上記1.2〜1.10の実行結果(psqlの出力・テスト結果・Vercelデプロイ確認結果)を、このセッションへ共有してほしい。共有いただき次第、`docs/PHASE_C1_MIGRATION_RESULTS.md`・`PHASE_C1_CONNECTION_RESULTS.md`・`PHASE_C1_SECURITY_RESULTS.md`・`PHASE_C1_ROLLBACK_RESULTS.md`・`PHASE_C1_COMPLETION_REPORT.md`を実測結果で更新する。

## 2. 指示書 各セクションと既存資産のマッピング

Phase C-0/PR #147マージ前最終修正指示の対応で、指示書§4〜§14が要求する試験内容の大部分は、既にソースコード上に実装され、CI(GitHub Actions、Supabase local)またはローカルの一時PostgreSQLで実地検証済みである。ステージングでの実施は、**同じ検証をローカル/CIの使い捨て環境ではなく、実際に永続するステージングSupabase・Vercel・Stripe/LINE外部サービスに対して行う**ことに意味がある(特に、外部サービスとの実ネットワーク経由の往復、Vercelという実デプロイ環境固有の設定漏れ、といったローカル/CIでは再現できないクラスの不具合を検出する)。

区分は指示書§17と同じ6区分を用いる: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / 5.未対応 / 6.問題あり。

| § | 内容 | 対応する既存資産 | 現状区分 |
|---|---|---|---|
| §4 | Migration preflight | `scripts/production-migration-preflight.sql`(本書と同時に、重複行に加えorphan FK・不正status分布・null不整合・10分以上processing・failed/dead件数・RPC実行権限・migration履歴を追加済み) | 2(ローカルの使い捨てPostgreSQLで全クエリの構文・実行を確認済み) |
| §5 | Migration適用(7ファイル) | `tests/migrations/run-upgrade-test.sh`(既存DB+PR #147新規7 migrationの適用手順そのもの。ステージングでは同じ手順を`psql`で手動、またはSupabase CLIの`supabase db push`で行う) | 2(ローカルの使い捨てPostgreSQLで実地確認済み、§3参照) |
| §5(適用後確認) | inbox/outbox claim_token・lease_expires_at・next_retry_at・entitlement自動取消・PUBLIC EXECUTE剥奪・event trigger作成 | `tests/integration/entitlement-concurrency.test.ts`・`integration-inbox-concurrency.test.ts`・`outbox-concurrency.test.ts`・`rls-policies.test.ts`(event trigger込み) | 2(CI/Supabase localで確認済み) |
| §6 | LINEログイン(新規/既存/Cookie/common_user_id未解決・解決済み/紹介URL/紹介者上書き禁止) | 自動テスト化不可(実LINEアカウント・LIFF実機を要する、`docs/BASELINE_TEST_RESULTS.md`に既存の制約として明記済み) | 1(ソースコードの読み取りによる仕様確認のみ)。staging実施は実機QAが必要 |
| §7 | ガチャ(無料/有料/券不足/日次上限/同時実行/美濃国解放/天下統一/動画取得失敗/request ID再送/JST日付境界) | `tests/integration/gacha-*.test.ts`・`tenka-toitsu.test.ts`・`gacha-animation-fetch-failure.test.ts`・`src/modules/gacha/domain/draw-limit.test.ts`(JST境界・美濃国解放しきい値) | 2(CI/Supabase local、および一部は開発用サンドボックスの実PostgreSQLで確認済み) |
| §8 | Stripe(Checkout・Webhook署名・completed・再送・10並列・grant・手動再実行) | `tests/contracts/stripe-webhook-purchase-flow.test.ts`(Stripe SDKで実署名生成、ローカルの`next dev`に対して実施)。ただし実際のStripeダッシュボード経由のCheckout作成・実Webhook配信はローカルでは未実施 | 2(署名検証等のロジックはlocal確認済み)。実Checkout・実Webhook配信は3が必要(staging未実施) |
| §9 | HMAC v1/v2(正常署名・改ざん系・nonce・timestamp・v1停止) | `tests/contracts/sen-no-kuni-hub-hmac.test.ts`(全項目を実HTTPリクエストで確認済み、対象は`next dev`) | 2(local/CI確認済み)。ステージングURLに対する同一テストの実施が3 |
| §10 | Entitlement(grant/revoke/revoke→grant/未同期→同期/dismissed/10並列/残高一致) | `tests/integration/entitlement-concurrency.test.ts` | 2(CI/Supabase local確認済み) |
| §11 | Outbox(紹介confirm成功/失敗・安定Idempotency-Key・sent更新前クラッシュ模擬・drain2並列・next_retry_at・dead・LINE通知重複許容) | `tests/integration/outbox-concurrency.test.ts`・`src/lib/common-user-hub.test.ts`(安定Idempotency-Key) | 2(CI/local確認済み) |
| §12 | RPC権限(anon/authenticated拒否・service_role許可・新規関数への自動適用) | `tests/integration/rls-policies.test.ts`・`docs/SECURITY_FINDINGS_PHASE_C0_PR4.md` | 2(CI/Supabase local確認済み)。ステージングDBでの実測値取得(§16「anon RPC拒否」の実測)は3が必要 |
| §13 | 管理画面(operator 403・manager成功・各種再実行・merge conflict・unresolved・監査ログ) | `tests/contracts/admin-recovery-endpoints.test.ts`・`tests/contracts/purchase-retry-grant.test.ts`・`src/lib/admin-audit-log.ts` | 2(local確認済み) |
| §14 | Rollback試験 | `docs/ROLLBACK_PHASE_C0_PR4.md`・`docs/ROLLBACK_BUGFIX.md`・`docs/ROLLBACK_P0_2.md`(手順の文書化のみ) | 1(手順書のみ、実機ロールバック演習は未実施) |
| §15 | Branch protection(8ジョブ+PR必須/up-to-date/会話解決/force-push禁止/削除禁止) | PR #147で`main`へ設定済み(`docs/CI_PIPELINE.md`参照) | **完了**(staging試験としては対象外、`main`に対して既に設定済みであることの確認のみ) |

## 3. 実施順序(指示書§3、現状の到達点)

```text
ステージングDBバックアップ          … 実行手順書(1.3)提供済み、実行は`stockbusiness`
↓
読み取り専用preflight              … スクリプト整備済み(§4)、実行手順書(1.4)提供済み、実行は`stockbusiness`
↓
現在のmigration履歴取得             … スクリプトに追加済み(§4の一部)、実行手順書(1.2)提供済み、実行は`stockbusiness`
↓
migration適用                      … 手順は既存(tests/migrations/run-upgrade-test.sh相当)+実行手順書(1.6)提供済み、実行は`stockbusiness`
↓
DB権限・関数確認                    … 既存テストで手順確立済み、実行手順書(1.7)提供済み、実行は`stockbusiness`
↓
ステージングアプリデプロイ           … 現行Vercelプロジェクトが既に対応(手順書1.8で最新デプロイを確認)
↓
接続試験                           … 既存contract/integration testで手順確立済み、実行手順書(1.9)提供済み、実行は`stockbusiness`
↓
復旧・rollback試験                  … 手順書(1.10)提供済み、実行は`stockbusiness`
↓
本番移行判定                       … Phase C-1完了報告の承認待ち(§18)
```

**このセッションからの直接実行が不可能な理由**: セッションのネットワークegressプロキシが`vutnjxswfamluicsxwwi.supabase.co`をallowlistしておらず(`403 Forbidden`)、かつプロキシの仕様上raw-TCPのデータベース接続(psql)自体がサポート対象外であるため。詳細は本書0章参照。

## 4. 本番環境への影響について

このセッションは本番Supabase・本番Vercel・本番Stripe・本番HMAC設定のいずれにも一切接続・変更していない(接続を試みたのは現行=ステージング環境のみで、それすらネットワーク制約により到達できなかった)。指示書§18の通り、Phase C-1完了報告が承認されるまで本番migration・本番Stripe・本番HMAC接続は実行しない。

## 5. 次のアクション

1. 本書1章の実行手順書に従い、`stockbusiness`が現行Supabase/Vercel(=ステージング)に対して手順1.2〜1.10を実施する
2. 実行結果(psqlの出力・テスト結果・Vercelデプロイ確認結果)をこのセッションへ共有する
3. 共有後、本セッションが`docs/PHASE_C1_MIGRATION_RESULTS.md`等の残り5文書を実測結果で更新する
