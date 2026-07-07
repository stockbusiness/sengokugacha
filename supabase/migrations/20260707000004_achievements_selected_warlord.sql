-- 天下統一達成時に選択する代表武将を記録するための列。
-- tenka_toitsu 以外の achievement_type では使わない想定(nullable)。
alter table achievements add column selected_warlord_id uuid references warlords(id);
