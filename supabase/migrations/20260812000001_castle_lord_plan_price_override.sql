-- 城主プラン料金は castle_lord_plan_settings.plan_price_yen(全城共通)を使っているが、
-- 城ごとに金額を変える運用が想定されるため、城単位の上書き列を用意する。
--
-- nullのときは全城共通の設定値をそのまま使う。既存の城は全てnullになるため、
-- この変更だけでは表示金額は一切変わらない(全城共通のまま)。
alter table castles add column if not exists lord_plan_price_yen int;

alter table castles drop constraint if exists castles_lord_plan_price_yen_check;
alter table castles add constraint castles_lord_plan_price_yen_check
  check (lord_plan_price_yen is null or lord_plan_price_yen >= 0);
