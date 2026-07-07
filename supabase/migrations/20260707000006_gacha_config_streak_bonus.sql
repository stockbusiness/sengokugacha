-- 03_gacha_game_design_v1.4.md 3章「登城(ログインボーナス)」の簡略実装。
-- 兵糧という別通貨は導入せず、無料ガチャの1日上限に連続ログイン日数ボーナスを加算する形にする
-- (04_mvp_spec 9章「無料ガチャ:1日1回(連続ログインボーナスで追加ガチャ権を付与)」に対応)。
alter table gacha_config
  add column streak_bonus_7day_draws int not null default 1,
  add column streak_bonus_30day_draws int not null default 2;
