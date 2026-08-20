-- Passport実装指示書 PR-P1a「旧コミッション・支払機能の新規書込み停止」。
--
-- 報酬計算・支払は5システムの正本表でAgencyの管轄になったため、Passport側の
-- 新規計上を止める。既存履歴・既存確定額・既存支払記録は保持し、状態遷移
-- (confirm/返金取消/支払)は既存分の清算のため従来どおり動かす(Q2回答 第1段階)。
--
-- 最も近い既存テーブルは castle_lord_plan_settings だが、あちらは価格・容量・猶予日数
-- という事業パラメータの置き場である。ここで扱うのは「Agencyへ移管したので書込みを
-- 止めている」という移管の状態で、寿命も撤去のタイミングも異なる。混ぜると将来この
-- 停止を解除・撤去するときに城主プラン設定へ手を入れることになるため、分けて持つ。
-- 手動適用運用のため、SQLを二重に貼っても壊れないようガードしておく。
create table if not exists commission_write_settings (
  id uuid primary key default gen_random_uuid(),
  -- 土地区画販売時の commission_ledger への新規計上(postLandSaleCommission)。
  land_sale_commission_write_enabled boolean not null default false,
  -- 報酬ルールセットの作成・更新・削除・公開。
  commission_rule_set_write_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table commission_write_settings enable row level security;

-- 行は投入しない。payment_settings / learning_journey_settings と同じシングルトン運用で、
-- 行が無い場合はコード側の既定値(両方false=停止)を返す。これによりマイグレーションを
-- 適用しただけで停止が有効になり、設定行の投入忘れが「意図せず書込みが開く」方向へ
-- 働かない。書込みを再開する場合だけ、責任者の承認のうえで1行insertする。
