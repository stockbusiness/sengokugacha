-- 千ノ国パスポート次期改修指示書 P0-2(§4.3・4.4・6.2)。
-- entitlement.granted/revokedの再入可能な状態管理と、順序逆転(revokeがgrantより先に届く)対応。

-- entitlement_idの一意性を発行元システム単位にする(§6.2)。複数の送信元システムが
-- 互いに独立したID採番をしている可能性があり、グローバル一意制約では正当なIDが
-- 衝突しうるため。
alter table entitlements drop constraint entitlements_entitlement_id_key;
alter table entitlements add constraint uq_entitlements_source_system_entitlement_id unique (source_system_key, entitlement_id);

-- 残高への反映(付与)・取消(取消)を、entitlements.status(granted/revoked、台帳上の状態)とは
-- 独立した状態として管理する(§4.3・4.4で指摘されたバグ#3・#4対応)。
-- これにより「entitlement_id自体は記録済みだが残高反映はまだ/失敗」「statusはrevoked化
-- 済みだが実際の残高減算は未実施」を区別でき、再送・再実行で正しく復旧できる。
alter table entitlements add column application_status text not null default 'not_applied'
  check (application_status in ('not_applied', 'applied', 'failed'));
alter table entitlements add column balance_applied_at timestamptz;
alter table entitlements add column application_attempt_count int not null default 0;
alter table entitlements add column application_last_error text;

alter table entitlements add column reversal_status text not null default 'not_reversed'
  check (reversal_status in ('not_reversed', 'reversed', 'failed'));
alter table entitlements add column balance_reversed_at timestamptz;
alter table entitlements add column reversal_attempt_count int not null default 0;
alter table entitlements add column reversal_last_error text;

-- entitlement.revokedがentitlement.grantedより先に届いた場合の保留領域(§4.4、
-- ①資料付録1で明記されている順序逆転ケースへの対応)。grant到着時にここを確認し、
-- 該当する保留取消があれば付与直後に取消処理を適用する。
create table entitlement_pending_revocations (
  id uuid primary key default gen_random_uuid(),
  source_system_key text not null,
  entitlement_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (source_system_key, entitlement_id)
);

alter table entitlement_pending_revocations enable row level security;
