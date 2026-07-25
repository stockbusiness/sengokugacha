-- 1国につき「コモン/中間/レア」各1体という設計を制約として保証し、
-- 20260707000002 のseedを将来 ON CONFLICT で安全に再実行できるようにする。
-- (20260707000002が自身のON CONFLICTのためにこの制約を先取りして作成している場合が
-- あるため、既存であればスキップする)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'warlords_province_id_slot_type_key'
  ) then
    alter table warlords add constraint warlords_province_id_slot_type_key unique (province_id, slot_type);
  end if;
end $$;
