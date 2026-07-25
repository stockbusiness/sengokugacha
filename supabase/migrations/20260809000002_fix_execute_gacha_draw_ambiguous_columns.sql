-- 千ノ国パスポート Phase C-0(§9 ガチャ統合テスト、実地確認で発覚)。
--
-- 20260808000006のexecute_gacha_draw()冪等リプレイ判定は
--   select id, is_new_card, province_conquered, region_completed,
--          region_completion_bonus, contribution_points_earned
--   from gacha_logs where request_id = p_request_id;
-- という素のSELECTだったが、is_new_card/province_conquered/region_completed/
-- region_completion_bonus/contribution_points_earnedは全てこの関数のOUTパラメータ名
-- (returns table(...))でもあり、PL/pgSQLの既定(plpgsql.variable_conflict = error)では
-- テーブル列とローカル変数が同名の場合は曖昧参照エラーになる。実地でSupabase local(Docker)に
-- 初めて接続したCI(PR #146)で"column reference is_new_card is ambiguous"として発覚した。
-- gacha_logs.のテーブル修飾を付けて曖昧さを解消する(ロジックは変更しない)。

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
  select gacha_logs.id, gacha_logs.is_new_card, gacha_logs.province_conquered, gacha_logs.region_completed,
         gacha_logs.region_completion_bonus, gacha_logs.contribution_points_earned
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
