-- 「はじまりの旅」PR5-a「Wallet送信の基盤」。外部送信は含まない。
--
-- PR2で作った learning_journey_reward_requests は「付与要求を保存するところまで」で、
-- 送信の排他制御を持っていない。既存の outbox(20260809000008)と同じ claim/fencing 方式を
-- 足し、並列実行・再送・タイムアウト回収を安全に行えるようにする。
--
-- 状態は現行7つのまま増やさない。付与機能OFF時は付与要求そのものを作らず、
-- 判定結果だけを別テーブルへ残す(禁止2「付与OFF期間の完了を無条件にPENDINGへ溜め、
-- 後日すべて自動送信してはいけない」への対応)。

-- ============================================================
-- 1. 付与要求への claim / fencing 列
-- ============================================================

alter table learning_journey_reward_requests
  -- fencing token。リース期限切れで再claimされた後、古いworkerが遅れて成功応答を
  -- 返しても状態を上書きできないようにする。
  add column if not exists claim_token uuid,
  add column if not exists lease_expires_at timestamptz,
  -- 指数バックオフ。この時刻まで再claimしない。
  add column if not exists next_retry_at timestamptz,
  -- 指示書§5.1「最終試行時刻」。
  add column if not exists last_attempted_at timestamptz,
  -- 指示書§5.1「エラーコード」。機械判定用。本文(last_error)とは分ける。
  add column if not exists wallet_error_code text,
  -- 指示書§5.1「request_id」。Wallet側のログと突き合わせる。
  add column if not exists request_id text;

-- 配送対象の抽出用。PROCESSINGを含めるのは、リース切れの回収対象になるため。
create index if not exists idx_learning_journey_reward_requests_dispatchable
  on learning_journey_reward_requests (next_retry_at)
  where status in ('PENDING', 'PROCESSING', 'FAILED');

-- ============================================================
-- 2. 付与判定の記録
-- ============================================================

-- 付与要求を作ったか、作らなかったか。作らなかった場合はその理由を残す。
--
-- learning_journey_completion_events へ列を足さないのは、あちらが「学習が完了した」と
-- いう事実の記録で、付与制度の状態とは寿命が違うため。付与方針は今後何度も変わるが、
-- 完了した事実は変わらない。混ぜると制度変更のたびに学習記録のスキーマを触ることになる。
create table if not exists learning_journey_reward_decisions (
  id uuid primary key default gen_random_uuid(),
  completion_event_id uuid not null unique
    references learning_journey_completion_events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,

  decision text not null check (decision in (
    'REQUESTED',           -- 付与要求を作成した(reward_request_id に紐づく)
    'REWARD_DISABLED',     -- 完了時点で付与制度が無効
    'DEFERRED_DECISION',   -- 対象者・予算・付与方針が未決定
    'NOT_ELIGIBLE'         -- 付与対象外のミッション(金額0等)
  )),
  reward_request_id uuid unique references learning_journey_reward_requests(id),

  -- 判定時点の根拠。後から設定が変わっても、当時なぜそう判定したかを追える。
  decided_amount integer not null default 0 check (decided_amount >= 0),
  decision_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- REQUESTED のときだけ付与要求に紐づく。逆も同様。
  constraint learning_journey_reward_decisions_request_link check (
    (decision = 'REQUESTED' and reward_request_id is not null)
    or (decision <> 'REQUESTED' and reward_request_id is null)
  )
);

alter table learning_journey_reward_decisions enable row level security;

create index if not exists idx_learning_journey_reward_decisions_decision
  on learning_journey_reward_decisions (decision, created_at);

-- ============================================================
-- 3. 送信アダプタの切替
-- ============================================================

-- 'fake' のみが実装済み。'http' はPR5-bで中身を入れる。既定は 'fake'。
-- コード側にもゲートを置くため、この列だけで実送信は始まらない。
alter table learning_journey_settings
  add column if not exists wallet_adapter text not null default 'fake';

alter table learning_journey_settings drop constraint if exists learning_journey_settings_wallet_adapter_check;
alter table learning_journey_settings add constraint learning_journey_settings_wallet_adapter_check
  check (wallet_adapter in ('fake', 'http'));

-- ============================================================
-- 4. claim / fencing
-- ============================================================

-- 20260809000008 の claim_integration_outbox_event() と同じ構造。実績のある方式を
-- そのまま踏襲する。付与要求は状態値が大文字なので、そこだけ読み替えている。
--
-- 上限到達時は dead ではなく FAILED(自動再試行停止)にする。状態を増やさないため
-- (再試行の可否は attempt_count と next_retry_at で判定する)。
create or replace function claim_learning_journey_reward_request(
  p_id uuid,
  p_claim_token uuid,
  p_lease_seconds int default 300,
  p_max_attempts int default 10
) returns text as $$
declare
  v_status text;
  v_attempt_count int;
  v_lease_expires_at timestamptz;
  v_next_retry_at timestamptz;
begin
  select status, attempt_count, lease_expires_at, next_retry_at
    into v_status, v_attempt_count, v_lease_expires_at, v_next_retry_at
  from learning_journey_reward_requests
  where id = p_id
  for update;

  if not found then return 'not_found'; end if;
  if v_status = 'SUCCEEDED' then return 'already_sent'; end if;
  if v_status in ('CANCELLED', 'REVERSED', 'LIMIT_HELD') then return 'not_eligible'; end if;

  if v_status = 'PROCESSING' and v_lease_expires_at is not null and v_lease_expires_at > now() then
    -- 他のworkerが処理中。二重送信防止の要。
    return 'in_progress';
  end if;

  if v_status not in ('PENDING', 'FAILED', 'PROCESSING') then
    return 'not_eligible';
  end if;

  if v_next_retry_at is not null and v_next_retry_at > now() then
    return 'not_due'; -- バックオフ期間中。
  end if;

  if v_attempt_count >= p_max_attempts then
    update learning_journey_reward_requests
    set status = 'FAILED',
        last_error = coalesce(last_error, '') || ' [再試行上限に達したため自動再試行を停止]',
        updated_at = now()
    where id = p_id;
    return 'dead';
  end if;

  update learning_journey_reward_requests
  set status = 'PROCESSING',
      -- リース切れ回収では新しいtokenへ更新する。これにより古いworkerの
      -- mark_* が0行更新となり、状態を上書きできない。
      claim_token = p_claim_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_attempted_at = now(),
      updated_at = now()
  where id = p_id;

  return 'claimed';
end;
$$ language plpgsql;

-- fencing。claim_token と PROCESSING の両方が一致した行だけを更新する。
-- 一致しなければ0行更新となり false を返す(= 自分のclaimは失効していた)。
create or replace function mark_learning_journey_reward_succeeded(
  p_id uuid,
  p_claim_token uuid,
  p_transaction_id text
) returns boolean as $$
declare
  v_count int;
begin
  update learning_journey_reward_requests
  set status = 'SUCCEEDED',
      wallet_transaction_id = p_transaction_id,
      sent_at = now(),
      next_retry_at = null,
      last_error = null,
      wallet_error_code = null,
      updated_at = now()
  where id = p_id and claim_token = p_claim_token and status = 'PROCESSING';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;

create or replace function mark_learning_journey_reward_failed(
  p_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error text,
  p_retry_after_seconds int default null
) returns boolean as $$
declare
  v_count int;
begin
  update learning_journey_reward_requests
  set status = 'FAILED',
      wallet_error_code = p_error_code,
      last_error = p_error,
      -- p_retry_after_seconds が null なら恒久エラー。next_retry_at を立てないので
      -- 以後 not_due にはならないが、claim側の上限判定で最終的に止まる。
      next_retry_at = case
        when p_retry_after_seconds is null then null
        else now() + make_interval(secs => p_retry_after_seconds)
      end,
      updated_at = now()
  where id = p_id and claim_token = p_claim_token and status = 'PROCESSING';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$ language plpgsql;
