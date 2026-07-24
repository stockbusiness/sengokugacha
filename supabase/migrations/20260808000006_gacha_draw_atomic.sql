-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-4(§8)。
-- src/lib/gacha.tsのperformDraw()は、日次上限確認(COUNT)→ガチャ券消費→
-- user_warlords読み書き→gacha_logs追加→国家貢献ポイント加算→国制覇判定→
-- 実績記録→地方ボーナス付与、という一連の処理が単一トランザクションでなく、
-- 個々の手順もread-modify-write(user_warlords.count/地方ボーナスのkokudaka加算)や
-- SELECT→INSERT(achievements)であるため、並行実行で日次上限超過・ガチャ券だけ
-- 減って結果が残らない・武将count更新消失・実績重複等が起こり得た。
-- 指示書§8.3推奨の単一Postgres関数execute_gacha_draw()へ統合する。

-- 日次上限の原子的な確認・予約(§8.3手順1)。business_dateはAsia/Tokyo基準で
-- アプリ側(getTokyoBusinessDate())が算出して渡す(§8.5「Asia/Tokyo基準で
-- 日付境界が一致」)。
create table gacha_daily_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  business_date date not null,
  draw_type text not null check (draw_type in ('free', 'paid')),
  draw_count int not null default 0,
  unique (user_id, business_date, draw_type)
);

alter table gacha_daily_usage enable row level security;

-- request_id単位の冪等性(§8.3必須制約 unique(request_id))と、動画演出選定の
-- 結果を後から反映するための列(演出選定は結果表示用の付随情報のため、
-- アトミックな本体処理の外(コミット後)で行う。既存animation_asset_id/animation_key
-- 列を再利用し、追加でis_new_card/province_conquered/region_completed/
-- region_completion_bonusを記録して冪等リプレイ時に同じ結果を返せるようにする。
alter table gacha_logs
  add column request_id uuid,
  add column is_new_card boolean not null default false,
  add column province_conquered boolean not null default false,
  add column region_completed text,
  add column region_completion_bonus int not null default 0,
  add column contribution_points_earned int not null default 0;

create unique index gacha_logs_request_id_key on gacha_logs (request_id) where request_id is not null;

-- achievement重複防止(§8.3必須制約 unique(user_id, achievement_type))。
-- 既存のsrc/lib/tenka-toitsu.ts(本Phaseのスコープ外)のachievements insertも
-- この制約の恩恵を受ける。既存データに重複が無いことを前提とする
-- (recordAchievementOnce()の既存ガードにより通常は発生しない)。
alter table achievements add constraint achievements_user_id_achievement_type_key unique (user_id, achievement_type);

-- ガチャ抽選の書き込み側(claim済みの武将・国の反映)を単一トランザクションで
-- 実行する。抽選そのもの(国・スロット・武将の決定、動画演出の選定)はDB設定
-- (排出率tier・動画アセット等)に依存する読み取り専用処理のためアプリ側(TS)で
-- 行い、その結果をここへ渡す(指示書§8.3の関数シグネチャの通り)。
--
-- 冪等性: 同一request_idで再度呼び出された場合、対応するgacha_logs行の結果を
-- そのまま返す(副作用は再実行しない)。
create or replace function execute_gacha_draw(
  p_user_id uuid,
  p_draw_type text,
  p_business_date date,
  p_daily_limit int,
  p_selected_province_id uuid,
  p_selected_warlord_id uuid,
  p_conquered_provinces_count_at_draw int,
  p_request_id uuid
) returns table (
  log_id uuid,
  is_new_card boolean,
  province_conquered boolean,
  region_completed text,
  region_completion_bonus int,
  contribution_points_earned int,
  remaining_draws_today int,
  remaining_gacha_tickets int
) as $$
declare
  v_existing_log_id uuid;
  v_existing_is_new_card boolean;
  v_existing_province_conquered boolean;
  v_existing_region_completed text;
  v_existing_region_completion_bonus int;
  v_existing_contribution_points int;
  v_current_draw_count int;
  v_is_new_card boolean;
  v_log_id uuid;
  v_slot_type text;
  v_contribution_points int;
  v_province_conquered boolean := false;
  v_region text;
  v_region_slug text;
  v_achievement_type text;
  v_region_province_ids uuid[];
  v_region_total_count int;
  v_region_conquered_count int;
  v_region_completed text := null;
  v_region_bonus int := 0;
  v_rule_id uuid;
  v_required_warlord_ids uuid[];
  v_owned_count int;
  v_achievement_row_count int;
  v_remaining_tickets int;
begin
  -- 冪等リプレイ: 既にこのrequest_idで処理済みならその結果を返す。
  select id, is_new_card, province_conquered, region_completed, region_completion_bonus, contribution_points_earned
    into v_existing_log_id, v_existing_is_new_card, v_existing_province_conquered, v_existing_region_completed,
         v_existing_region_completion_bonus, v_existing_contribution_points
  from gacha_logs
  where request_id = p_request_id;

  if found then
    select coalesce(draw_count, 0) into v_current_draw_count from gacha_daily_usage
      where user_id = p_user_id and business_date = p_business_date and draw_type = p_draw_type;
    if p_draw_type = 'paid' then
      select gacha_tickets into v_remaining_tickets from users where id = p_user_id;
    end if;
    log_id := v_existing_log_id;
    is_new_card := v_existing_is_new_card;
    province_conquered := v_existing_province_conquered;
    region_completed := v_existing_region_completed;
    region_completion_bonus := v_existing_region_completion_bonus;
    contribution_points_earned := v_existing_contribution_points;
    remaining_draws_today := greatest(p_daily_limit - coalesce(v_current_draw_count, 0), 0);
    remaining_gacha_tickets := v_remaining_tickets;
    return next;
    return;
  end if;

  -- 1. 日次上限確認・予約。行ロックを取得したまま以降の全手順を実行するため、
  -- 同一ユーザーの並行リクエストはここで直列化される。
  insert into gacha_daily_usage (user_id, business_date, draw_type, draw_count)
  values (p_user_id, p_business_date, p_draw_type, 0)
  on conflict (user_id, business_date, draw_type) do nothing;

  select draw_count into v_current_draw_count
  from gacha_daily_usage
  where user_id = p_user_id and business_date = p_business_date and draw_type = p_draw_type
  for update;

  if v_current_draw_count >= p_daily_limit then
    raise exception 'gacha_daily_limit_exceeded';
  end if;

  update gacha_daily_usage
  set draw_count = draw_count + 1
  where user_id = p_user_id and business_date = p_business_date and draw_type = p_draw_type
  returning draw_count into v_current_draw_count;

  -- 2. 有料の場合ガチャ券消費。既存のconsume_gacha_ticket()(マイグレーション
  -- 20260803000001)をネスト呼び出しする。ネストされた呼び出しは同一トランザクション
  -- で実行されるため、これ以降の手順が失敗すれば消費も含めて全体がロールバックされる。
  if p_draw_type = 'paid' then
    select consume_gacha_ticket(p_user_id) into v_remaining_tickets;
  end if;

  -- 3. user_warlords upsert + count増加。xmax = 0は「このコマンドで新規insertされた行」
  -- を示す標準的なPostgresイディオムで、新規獲得(isNewCard)の判定に使う。
  insert into user_warlords (user_id, warlord_id, count)
  values (p_user_id, p_selected_warlord_id, 1)
  on conflict (user_id, warlord_id) do update set count = user_warlords.count + 1
  returning (xmax = 0) into v_is_new_card;

  -- 国家貢献ポイントの算出(src/modules/gacha/domain/rarity.tsのcalcContributionPoints()と
  -- 同じ配点。isNewCardがここで確定するため、ポイント計算もこの関数内で行う)。
  select slot_type into v_slot_type from warlords where id = p_selected_warlord_id;
  v_contribution_points := case v_slot_type
    when 'common' then 5
    when 'mid' then 15
    when 'rare' then 40
    else 0
  end + case when v_is_new_card then 10 else 0 end;

  -- 4. gacha_logs追加。動画演出情報(animation_asset_id/animation_key)はコミット後に
  -- アプリ側からベストエフォートで追記する(演出選定の失敗でガチャ自体を失敗させない
  -- という既存方針を維持するため、あえてこのトランザクションに含めない)。
  insert into gacha_logs (
    user_id, warlord_id, is_paid, conquered_provinces_count_at_draw, request_id, is_new_card
  )
  values (
    p_user_id, p_selected_warlord_id, p_draw_type = 'paid', p_conquered_provinces_count_at_draw, p_request_id, v_is_new_card
  )
  returning id into v_log_id;

  -- 5. 国家貢献ポイント加算。user_activityへの記録+残高加算(src/lib/user-activity.ts
  -- recordContribution()と同じ2手順)をこのトランザクション内で行う。
  insert into user_activity (user_id, activity_type, point) values (p_user_id, 'gacha_draw', v_contribution_points);
  perform adjust_user_balance(p_user_id, 'contribution_points', v_contribution_points);

  -- 6. 国制覇判定+upsert。conquest_rulesが有効ならそれを使い、無ければ
  -- 「その国の武将を全部所持」にフォールバックする(既存のmaybeConquerProvince()と
  -- 同じ判定、実装計画3-4章の既存60国互換フォールバックを維持)。
  select id into v_rule_id from conquest_rules where province_id = p_selected_province_id and is_active = true;
  if v_rule_id is not null then
    select coalesce(array_agg(warlord_id), array[]::uuid[]) into v_required_warlord_ids
      from conquest_rule_warlords where rule_id = v_rule_id and is_required = true;
  else
    select coalesce(array_agg(id), array[]::uuid[]) into v_required_warlord_ids
      from warlords where province_id = p_selected_province_id;
  end if;

  if coalesce(array_length(v_required_warlord_ids, 1), 0) > 0 then
    select count(*) into v_owned_count from user_warlords
      where user_id = p_user_id and warlord_id = any(v_required_warlord_ids);
    if v_owned_count >= array_length(v_required_warlord_ids, 1) then
      insert into user_provinces (user_id, province_id, is_conquered, conquered_at)
      values (p_user_id, p_selected_province_id, true, now())
      on conflict (user_id, province_id) do update set is_conquered = true, conquered_at = now();
      v_province_conquered := true;
    end if;
  end if;

  -- 7. achievement upsert + 8. 地方ボーナス加算。今回の抽選で国を制圧した場合のみ
  -- 地方コンプ判定を行う(既存のmaybeCompleteRegion()と同じ流れ)。
  if v_province_conquered then
    select region into v_region from provinces where id = p_selected_province_id;

    select coalesce(array_agg(id), array[]::uuid[]) into v_region_province_ids
      from provinces where region = v_region and is_final_province = false;
    v_region_total_count := coalesce(array_length(v_region_province_ids, 1), 0);

    if v_region_total_count > 0 then
      select count(*) into v_region_conquered_count from user_provinces
        where user_id = p_user_id and is_conquered = true and province_id = any(v_region_province_ids);

      if v_region_conquered_count >= v_region_total_count then
        -- src/modules/conquest/domain/region-completion.tsのREGION_SLUGSと同じ対応表。
        -- 変更する場合は両方を同期させること。
        v_region_slug := case v_region
          when '東北' then 'tohoku'
          when '関東' then 'kanto'
          when '中部' then 'chubu'
          when '近畿' then 'kinki'
          when '中国' then 'chugoku'
          when '四国' then 'shikoku'
          when '九州' then 'kyushu'
          when '北陸' then 'hokuriku'
          else v_region
        end;
        v_achievement_type := 'region_complete_' || v_region_slug;

        insert into achievements (user_id, achievement_type, referring_agent_id)
        select p_user_id, v_achievement_type, referring_agent_id from users where id = p_user_id
        on conflict (user_id, achievement_type) do nothing;
        get diagnostics v_achievement_row_count = row_count;

        if v_achievement_row_count > 0 then
          -- src/modules/conquest/domain/region-completion.tsのKOKUDAKA_BONUS_PER_PROVINCE(100)
          -- と同じ配点。変更する場合は両方を同期させること。
          v_region_bonus := v_region_total_count * 100;
          perform adjust_user_balance(p_user_id, 'kokudaka', v_region_bonus);
          v_region_completed := v_region;
        end if;
      end if;
    end if;
  end if;

  update gacha_logs
  set province_conquered = v_province_conquered,
      region_completed = v_region_completed,
      region_completion_bonus = v_region_bonus,
      contribution_points_earned = v_contribution_points
  where id = v_log_id;

  -- 9. commit(関数の正常終了によりトランザクション全体がコミットされる)。
  log_id := v_log_id;
  is_new_card := v_is_new_card;
  province_conquered := v_province_conquered;
  region_completed := v_region_completed;
  region_completion_bonus := v_region_bonus;
  contribution_points_earned := v_contribution_points;
  remaining_draws_today := greatest(p_daily_limit - v_current_draw_count, 0);
  remaining_gacha_tickets := v_remaining_tickets;
  return next;
end;
$$ language plpgsql;
