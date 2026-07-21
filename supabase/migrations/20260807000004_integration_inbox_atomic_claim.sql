-- 千ノ国パスポート次期改修指示書 P0-2(§4.5)。
-- claimInboxEvent()の既存行re-claim時にWHERE句ガードが無く、並行リクエストが両方とも
-- outcome:"new"を得てハンドラを二重実行できるバグ#5の修正。

-- 長時間processingのまま止まったイベント(処理中にサーバーが落ちた等)を検知するための列。
alter table integration_inbox_events add column claimed_at timestamptz;

-- INSERT ON CONFLICT DO NOTHING + SELECT ... FOR UPDATEによる原子的claim。
-- 関数呼び出しは呼び出し元の1トランザクションとして実行されるため、同時に呼ばれた
-- 2つのリクエストのうちFOR UPDATEで行ロックを先に取得した方が処理を完了してから、
-- もう一方がロック解放後に更新後の状態を見て正しく分岐できる(動的SQL/EXECUTEは使わない)。
create or replace function claim_integration_inbox_event(
  p_source_system_key text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_payload_hash text
) returns table (claim_outcome text, event_row_id uuid) as $$
declare
  v_id uuid;
  v_status text;
  v_payload_hash text;
begin
  insert into integration_inbox_events (source_system_key, event_id, event_type, payload, payload_hash, status, attempt_count, claimed_at)
  values (p_source_system_key, p_event_id, p_event_type, p_payload, p_payload_hash, 'processing', 1, now())
  on conflict (source_system_key, event_id) do nothing
  returning id into v_id;

  if v_id is not null then
    claim_outcome := 'new';
    event_row_id := v_id;
    return next;
    return;
  end if;

  select id, status, payload_hash into v_id, v_status, v_payload_hash
  from integration_inbox_events
  where source_system_key = p_source_system_key and event_id = p_event_id
  for update;

  if v_payload_hash <> p_payload_hash then
    claim_outcome := 'conflict';
    event_row_id := v_id;
    return next;
    return;
  end if;

  if v_status = 'succeeded' then
    claim_outcome := 'duplicate';
    event_row_id := v_id;
    return next;
    return;
  end if;

  if v_status = 'dead' then
    claim_outcome := 'dead';
    event_row_id := v_id;
    return next;
    return;
  end if;

  -- 'processing'のまま10分以上経過している行は、処理中プロセスが異常終了した可能性が
  -- あるとみなし再claimを許可する(Cron基盤が無いため、次にこのevent_idを受信した時点での
  -- 自己回復として実装する)。
  if v_status = 'processing' then
    update integration_inbox_events
    set status = 'processing', attempt_count = attempt_count + 1, claimed_at = now()
    where id = v_id and claimed_at < now() - interval '10 minutes';

    if found then
      claim_outcome := 'new';
      event_row_id := v_id;
      return next;
      return;
    end if;

    claim_outcome := 'in_progress';
    event_row_id := v_id;
    return next;
    return;
  end if;

  -- 'pending'/'failed' -> 再試行対象として claim する。
  update integration_inbox_events
  set status = 'processing', attempt_count = attempt_count + 1, claimed_at = now()
  where id = v_id;

  claim_outcome := 'new';
  event_row_id := v_id;
  return next;
end;
$$ language plpgsql;
