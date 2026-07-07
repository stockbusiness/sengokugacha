-- 初期国マスタ・武将マスタ投入(仮データ)
-- 03_gacha_game_design_v1.4.md 11〜12章の初期投入国リスト(25国+美濃)に基づく。
--
-- 【重要】本マイグレーションは MVP開発優先順位2番目「武将マスタ・国マスタのDB投入」に対応する
-- 一次データです。以下は未確定・仮データであり、後日 05/06 の画像生成ガイドで素材が揃い次第、
-- 管理画面または直接UPDATEで更新する前提とする。
--   - 各国のスロット2体目(中間枠)・1体目(コモン枠)の武将名は「(仮)」表記のプレースホルダー
--   - stats_json・lore は簡易な仮データ
--   - image_url / gacha_reveal_animation_url / tenka_toitsu_image_url は未着手のため NULL のまま

-- ============================================================
-- 国マスタ(25国 + 美濃)
-- ============================================================

insert into provinces (name, region, is_final_province, unlock_condition_count, display_order, landmark_name) values
  ('陸奥', '東北', false, null, 1, null),
  ('出羽', '東北', false, null, 2, null),
  ('相模', '関東', false, null, 3, null),
  ('武蔵', '関東', false, null, 4, null),
  ('上野', '関東', false, null, 5, null),
  ('尾張', '中部', false, null, 6, null),
  ('三河', '中部', false, null, 7, null),
  ('甲斐', '中部', false, null, 8, null),
  ('越後', '中部', false, null, 9, null),
  ('駿河', '中部', false, null, 10, null),
  ('飛騨', '中部', false, null, 11, null),
  ('近江', '近畿', false, null, 12, null),
  ('山城', '近畿', false, null, 13, null),
  ('大和', '近畿', false, null, 14, null),
  ('播磨', '近畿', false, null, 15, null),
  ('安芸', '中国', false, null, 16, null),
  ('備前', '中国', false, null, 17, null),
  ('出雲', '中国', false, null, 18, null),
  ('周防', '中国', false, null, 19, null),
  ('土佐', '四国', false, null, 20, null),
  ('伊予', '四国', false, null, 21, null),
  ('薩摩', '九州', false, null, 22, null),
  ('肥前', '九州', false, null, 23, null),
  ('豊後', '九州', false, null, 24, null),
  ('加賀', '北陸', false, null, 25, null),
  ('美濃', '中部', true, 60, 26, '岐阜城');

-- ============================================================
-- 武将マスタ(26国 × 3体 = 78体)
-- 各国: 1体目=コモン枠(足軽級・出やすい)/2体目=中間枠(武将級)/3体目=レア枠(その国の顔)
-- ============================================================

insert into warlords (province_id, name, rarity, slot_type, stats_json, lore) values
  -- 陸奥
  ((select id from provinces where name = '陸奥'), '陸奥国の足軽(仮)', '足軽級', 'common', '{"統率":30,"知略":25,"勇猛":32}'::jsonb, '奥州の地を守る名もなき足軽。'),
  ((select id from provinces where name = '陸奥'), '陸奥国の武将(仮)', '武将級', 'mid', '{"統率":55,"知略":50,"勇猛":58}'::jsonb, '伊達家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '陸奥'), '伊達政宗', '大名級', 'rare', '{"統率":88,"知略":82,"勇猛":90}'::jsonb, '独眼竜の異名を持つ奥州の梟雄。天下取りの野心を抱き続けた。'),

  -- 出羽
  ((select id from provinces where name = '出羽'), '出羽国の足軽(仮)', '足軽級', 'common', '{"統率":29,"知略":26,"勇猛":30}'::jsonb, '出羽の地を守る名もなき足軽。'),
  ((select id from provinces where name = '出羽'), '出羽国の武将(仮)', '武将級', 'mid', '{"統率":54,"知略":52,"勇猛":55}'::jsonb, '最上家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '出羽'), '最上義光', '大名級', 'rare', '{"統率":83,"知略":87,"勇猛":80}'::jsonb, '出羽の驍将。智略に長け、独眼竜とも渡り合った。'),

  -- 相模
  ((select id from provinces where name = '相模'), '相模国の足軽(仮)', '足軽級', 'common', '{"統率":31,"知略":27,"勇猛":30}'::jsonb, '相模の地を守る名もなき足軽。'),
  ((select id from provinces where name = '相模'), '相模国の武将(仮)', '武将級', 'mid', '{"統率":56,"知略":51,"勇猛":54}'::jsonb, '北条家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '相模'), '北条氏康', '大名級', 'rare', '{"統率":90,"知略":85,"勇猛":83}'::jsonb, '相模の獅子と称された関東随一の戦上手。'),

  -- 武蔵
  ((select id from provinces where name = '武蔵'), '武蔵国の足軽(仮)', '足軽級', 'common', '{"統率":28,"知略":28,"勇猛":29}'::jsonb, '武蔵の地を守る名もなき足軽。'),
  ((select id from provinces where name = '武蔵'), '武蔵国の武将(仮)', '武将級', 'mid', '{"統率":53,"知略":54,"勇猛":52}'::jsonb, '関東に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '武蔵'), '太田道灌', '大名級', 'rare', '{"統率":80,"知略":90,"勇猛":75}'::jsonb, '江戸城を築いた築城の名手にして稀代の軍略家。'),

  -- 上野
  ((select id from provinces where name = '上野'), '上野国の足軽(仮)', '足軽級', 'common', '{"統率":27,"知略":27,"勇猛":28}'::jsonb, '上野の地を守る名もなき足軽。'),
  ((select id from provinces where name = '上野'), '上野国の武将(仮)', '武将級', 'mid', '{"統率":52,"知略":53,"勇猛":51}'::jsonb, '関東の国衆に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '上野'), '長野業正', '大名級', 'rare', '{"統率":78,"知略":85,"勇猛":76}'::jsonb, '箕輪城に拠り、武田軍を幾度も退けた知将。'),

  -- 尾張
  ((select id from provinces where name = '尾張'), '尾張国の足軽(仮)', '足軽級', 'common', '{"統率":32,"知略":28,"勇猛":33}'::jsonb, '尾張の地を守る名もなき足軽。'),
  ((select id from provinces where name = '尾張'), '尾張国の武将(仮)', '武将級', 'mid', '{"統率":57,"知略":53,"勇猛":56}'::jsonb, '織田家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '尾張'), '織田信秀', '大名級', 'rare', '{"統率":85,"知略":80,"勇猛":84}'::jsonb, '尾張統一を進めた織田家中興の祖。天下人の父。'),

  -- 三河
  ((select id from provinces where name = '三河'), '三河国の足軽(仮)', '足軽級', 'common', '{"統率":30,"知略":29,"勇猛":31}'::jsonb, '三河の地を守る名もなき足軽。'),
  ((select id from provinces where name = '三河'), '三河国の武将(仮)', '武将級', 'mid', '{"統率":55,"知略":54,"勇猛":55}'::jsonb, '徳川家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '三河'), '徳川家康', '大名級', 'rare', '{"統率":90,"知略":88,"勇猛":80}'::jsonb, '艱難辛苦を乗り越え、後に天下を統べる忍耐の将。'),

  -- 甲斐
  ((select id from provinces where name = '甲斐'), '甲斐国の足軽(仮)', '足軽級', 'common', '{"統率":31,"知略":28,"勇猛":32}'::jsonb, '甲斐の地を守る名もなき足軽。'),
  ((select id from provinces where name = '甲斐'), '甲斐国の武将(仮)', '武将級', 'mid', '{"統率":56,"知略":54,"勇猛":57}'::jsonb, '武田家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '甲斐'), '武田信玄', '大名級', 'rare', '{"統率":92,"知略":88,"勇猛":87}'::jsonb, '甲斐の虎と呼ばれた戦国最強クラスの戦上手。'),

  -- 越後
  ((select id from provinces where name = '越後'), '越後国の足軽(仮)', '足軽級', 'common', '{"統率":30,"知略":27,"勇猛":33}'::jsonb, '越後の地を守る名もなき足軽。'),
  ((select id from provinces where name = '越後'), '越後国の武将(仮)', '武将級', 'mid', '{"統率":55,"知略":52,"勇猛":58}'::jsonb, '上杉家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '越後'), '上杉謙信', '大名級', 'rare', '{"統率":91,"知略":85,"勇猛":92}'::jsonb, '軍神と称された越後の龍。義を重んじた名将。'),

  -- 駿河
  ((select id from provinces where name = '駿河'), '駿河国の足軽(仮)', '足軽級', 'common', '{"統率":29,"知略":29,"勇猛":29}'::jsonb, '駿河の地を守る名もなき足軽。'),
  ((select id from provinces where name = '駿河'), '駿河国の武将(仮)', '武将級', 'mid', '{"統率":54,"知略":55,"勇猛":53}'::jsonb, '今川家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '駿河'), '今川義元', '大名級', 'rare', '{"統率":84,"知略":83,"勇猛":72}'::jsonb, '海道一の弓取りと謳われた東海の名門大名。'),

  -- 飛騨
  ((select id from provinces where name = '飛騨'), '飛騨国の足軽(仮)', '足軽級', 'common', '{"統率":26,"知略":26,"勇猛":27}'::jsonb, '飛騨の地を守る名もなき足軽。'),
  ((select id from provinces where name = '飛騨'), '飛騨国の武将(仮)', '武将級', 'mid', '{"統率":50,"知略":50,"勇猛":50}'::jsonb, '飛騨の国衆に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '飛騨'), '姉小路氏', '大名級', 'rare', '{"統率":70,"知略":68,"勇猛":65}'::jsonb, '飛騨山中に勢力を張った国衆の一族。'),

  -- 近江
  ((select id from provinces where name = '近江'), '近江国の足軽(仮)', '足軽級', 'common', '{"統率":30,"知略":28,"勇猛":30}'::jsonb, '近江の地を守る名もなき足軽。'),
  ((select id from provinces where name = '近江'), '近江国の武将(仮)', '武将級', 'mid', '{"統率":55,"知略":53,"勇猛":54}'::jsonb, '浅井家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '近江'), '浅井長政', '大名級', 'rare', '{"統率":80,"知略":75,"勇猛":82}'::jsonb, '北近江を治め、信長と姻戚を結んだ悲運の名将。'),

  -- 山城
  ((select id from provinces where name = '山城'), '山城国の足軽(仮)', '足軽級', 'common', '{"統率":29,"知略":30,"勇猛":28}'::jsonb, '山城の地を守る名もなき足軽。'),
  ((select id from provinces where name = '山城'), '山城国の武将(仮)', '武将級', 'mid', '{"統率":53,"知略":56,"勇猛":52}'::jsonb, '京の武家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '山城'), '明智光秀', '大名級', 'rare', '{"統率":83,"知略":92,"勇猛":74}'::jsonb, '教養と知略を兼ね備えた本能寺の主役。'),

  -- 大和
  ((select id from provinces where name = '大和'), '大和国の足軽(仮)', '足軽級', 'common', '{"統率":28,"知略":29,"勇猛":29}'::jsonb, '大和の地を守る名もなき足軽。'),
  ((select id from provinces where name = '大和'), '大和国の武将(仮)', '武将級', 'mid', '{"統率":52,"知略":55,"勇猛":53}'::jsonb, '大和の国衆に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '大和'), '松永久秀', '大名級', 'rare', '{"統率":81,"知略":90,"勇猛":78}'::jsonb, '梟雄と恐れられた稀代の謀将。'),

  -- 播磨
  ((select id from provinces where name = '播磨'), '播磨国の足軽(仮)', '足軽級', 'common', '{"統率":29,"知略":28,"勇猛":30}'::jsonb, '播磨の地を守る名もなき足軽。'),
  ((select id from provinces where name = '播磨'), '播磨国の武将(仮)', '武将級', 'mid', '{"統率":54,"知略":54,"勇猛":54}'::jsonb, '播磨の国衆に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '播磨'), '黒田官兵衛', '大名級', 'rare', '{"統率":82,"知略":93,"勇猛":75}'::jsonb, '秀吉の天下統一を支えた稀代の軍師。'),

  -- 安芸
  ((select id from provinces where name = '安芸'), '安芸国の足軽(仮)', '足軽級', 'common', '{"統率":29,"知略":29,"勇猛":30}'::jsonb, '安芸の地を守る名もなき足軽。'),
  ((select id from provinces where name = '安芸'), '安芸国の武将(仮)', '武将級', 'mid', '{"統率":54,"知略":55,"勇猛":53}'::jsonb, '毛利家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '安芸'), '毛利元就', '大名級', 'rare', '{"統率":87,"知略":93,"勇猛":78}'::jsonb, '謀略と結束で中国地方の覇者となった知将。'),

  -- 備前
  ((select id from provinces where name = '備前'), '備前国の足軽(仮)', '足軽級', 'common', '{"統率":28,"知略":28,"勇猛":29}'::jsonb, '備前の地を守る名もなき足軽。'),
  ((select id from provinces where name = '備前'), '備前国の武将(仮)', '武将級', 'mid', '{"統率":53,"知略":54,"勇猛":52}'::jsonb, '宇喜多家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '備前'), '宇喜多直家', '大名級', 'rare', '{"統率":80,"知略":91,"勇猛":73}'::jsonb, '権謀術数を駆使し備前に覇を唱えた梟雄。'),

  -- 出雲
  ((select id from provinces where name = '出雲'), '出雲国の足軽(仮)', '足軽級', 'common', '{"統率":28,"知略":27,"勇猛":28}'::jsonb, '出雲の地を守る名もなき足軽。'),
  ((select id from provinces where name = '出雲'), '出雲国の武将(仮)', '武将級', 'mid', '{"統率":52,"知略":53,"勇猛":51}'::jsonb, '尼子家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '出雲'), '尼子経久', '大名級', 'rare', '{"統率":83,"知略":88,"勇猛":76}'::jsonb, '山陰に一大勢力を築いた謀略の名手。'),

  -- 周防
  ((select id from provinces where name = '周防'), '周防国の足軽(仮)', '足軽級', 'common', '{"統率":27,"知略":28,"勇猛":27}'::jsonb, '周防の地を守る名もなき足軽。'),
  ((select id from provinces where name = '周防'), '周防国の武将(仮)', '武将級', 'mid', '{"統率":51,"知略":54,"勇猛":50}'::jsonb, '大内家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '周防'), '大内義隆', '大名級', 'rare', '{"統率":75,"知略":82,"勇猛":60}'::jsonb, '西国随一の文化と富を誇った大内家当主。'),

  -- 土佐
  ((select id from provinces where name = '土佐'), '土佐国の足軽(仮)', '足軽級', 'common', '{"統率":30,"知略":28,"勇猛":32}'::jsonb, '土佐の地を守る名もなき足軽。'),
  ((select id from provinces where name = '土佐'), '土佐国の武将(仮)', '武将級', 'mid', '{"統率":55,"知略":53,"勇猛":57}'::jsonb, '長宗我部家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '土佐'), '長宗我部元親', '大名級', 'rare', '{"統率":85,"知略":80,"勇猛":86}'::jsonb, '土佐を統一し四国制覇に迫った「土佐の出来人」。'),

  -- 伊予
  ((select id from provinces where name = '伊予'), '伊予国の足軽(仮)', '足軽級', 'common', '{"統率":27,"知略":27,"勇猛":28}'::jsonb, '伊予の地を守る名もなき足軽。'),
  ((select id from provinces where name = '伊予'), '伊予国の武将(仮)', '武将級', 'mid', '{"統率":50,"知略":51,"勇猛":50}'::jsonb, '河野家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '伊予'), '河野氏', '大名級', 'rare', '{"統率":72,"知略":70,"勇猛":74}'::jsonb, '伊予水軍を率いた瀬戸内の名家。'),

  -- 薩摩
  ((select id from provinces where name = '薩摩'), '薩摩国の足軽(仮)', '足軽級', 'common', '{"統率":31,"知略":27,"勇猛":34}'::jsonb, '薩摩の地を守る名もなき足軽。'),
  ((select id from provinces where name = '薩摩'), '薩摩国の武将(仮)', '武将級', 'mid', '{"統率":56,"知略":52,"勇猛":59}'::jsonb, '島津家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '薩摩'), '島津義弘', '大名級', 'rare', '{"統率":89,"知略":80,"勇猛":93}'::jsonb, '鬼島津と恐れられた薩摩随一の猛将。'),

  -- 肥前
  ((select id from provinces where name = '肥前'), '肥前国の足軽(仮)', '足軽級', 'common', '{"統率":29,"知略":27,"勇猛":30}'::jsonb, '肥前の地を守る名もなき足軽。'),
  ((select id from provinces where name = '肥前'), '肥前国の武将(仮)', '武将級', 'mid', '{"統率":53,"知略":52,"勇猛":54}'::jsonb, '龍造寺家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '肥前'), '龍造寺隆信', '大名級', 'rare', '{"統率":81,"知略":78,"勇猛":83}'::jsonb, '肥前の熊と呼ばれた九州の雄。'),

  -- 豊後
  ((select id from provinces where name = '豊後'), '豊後国の足軽(仮)', '足軽級', 'common', '{"統率":28,"知略":29,"勇猛":28}'::jsonb, '豊後の地を守る名もなき足軽。'),
  ((select id from provinces where name = '豊後'), '豊後国の武将(仮)', '武将級', 'mid', '{"統率":52,"知略":55,"勇猛":51}'::jsonb, '大友家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '豊後'), '大友宗麟', '大名級', 'rare', '{"統率":79,"知略":81,"勇猛":68}'::jsonb, '南蛮貿易で栄えたキリシタン大名。'),

  -- 加賀
  ((select id from provinces where name = '加賀'), '加賀国の足軽(仮)', '足軽級', 'common', '{"統率":30,"知略":28,"勇猛":31}'::jsonb, '加賀の地を守る名もなき足軽。'),
  ((select id from provinces where name = '加賀'), '加賀国の武将(仮)', '武将級', 'mid', '{"統率":55,"知略":52,"勇猛":56}'::jsonb, '前田家に仕える武将。詳細は今後追加予定。'),
  ((select id from provinces where name = '加賀'), '前田利家', '大名級', 'rare', '{"統率":84,"知略":76,"勇猛":85}'::jsonb, '槍の又左の異名を持つ加賀百万石の祖。'),

  -- 美濃(最終国。専用特別枠)
  ((select id from provinces where name = '美濃'), '美濃国の足軽(仮)', '侍級', 'common', '{"統率":40,"知略":38,"勇猛":42}'::jsonb, '美濃の地を守る古参の足軽。'),
  ((select id from provinces where name = '美濃'), '斎藤道三', '大名級', 'mid', '{"統率":86,"知略":94,"勇猛":80}'::jsonb, '美濃のマムシと恐れられた下剋上の体現者。'),
  ((select id from provinces where name = '美濃'), '織田信長', '大名級', 'rare', '{"統率":95,"知略":93,"勇猛":90}'::jsonb, '天下布武を掲げ、時代を切り拓いた革新の覇王。');
