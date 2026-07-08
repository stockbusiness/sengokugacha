-- 1国につき「コモン/中間/レア」各1体という設計を制約として保証し、
-- 20260707000002 のseedを将来 ON CONFLICT で安全に再実行できるようにする。
alter table warlords add constraint warlords_province_id_slot_type_key unique (province_id, slot_type);
