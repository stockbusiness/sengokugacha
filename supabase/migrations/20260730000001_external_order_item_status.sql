-- 外部購入管理: 一部取消(実装指示書v1.0 9-4「複数区画注文の一部のみ取消できる
-- 設計とする」)に対応するため、注文明細ごとの状態を持たせる。
-- activeのまま=通常通り扱う。cancelledになった明細は、割当状況の集計
-- (computeOrderAssignmentStatus)から除外し、権利付与の対象からも外す。
alter table external_order_items add column status text not null default 'active'
  check (status in ('active', 'cancelled'));
