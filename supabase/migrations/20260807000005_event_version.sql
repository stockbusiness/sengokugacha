-- 千ノ国パスポート次期改修指示書 P0-2(§6.5相当、バグ#7)。
-- X-Event-Versionの受信履歴保存に対応するため列を追加し、claim_integration_inbox_event()を
-- event_versionを保存できるシグネチャへ差し替える(引数構成が変わるため一度dropしてから再作成)。

alter table integration_inbox_events add column event_version text;

drop function if exists claim_integration_inbox_event(text, text, text, jsonb, text);

create or replace function claim_integration_inbox_event(
  p_source_system_key text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_payload_hash text,
  p_event_version text
) returns table (claim_outcome text, event_row_id uuid) as $$
declare
  v_id uuid;
  v_status text;
  v_payload_hash text;
begin
  insert into integration_inbox_events
    (source_system_key, event_id, event_type, payload, payload_hash, status, attempt_count, claimed_at, event_version)
  values
    (p_source_system_key, p_event_id, p_event_type, p_payload, p_payload_hash, 'processing', 1, now(), p_event_version)
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

  update integration_inbox_events
  set status = 'processing', attempt_count = attempt_count + 1, claimed_at = now()
  where id = v_id;

  claim_outcome := 'new';
  event_row_id := v_id;
  return next;
end;
$$ language plpgsql;
