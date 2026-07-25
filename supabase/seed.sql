-- 千ノ国パスポート Phase C-0(DB統合テスト・マイグレーション安全化・CI必須化指示書)。
-- Supabase local環境専用のシードデータ。`supabase db reset`のたびに自動投入される。
-- 本番データは一切含まない。テストが依存する最小限のマスタ・設定行のみを用意する。

-- ガチャ統合テスト(§9)向け: 制圧済み扱いにならない非最終国+3スロット分の武将。
insert into provinces (id, name, region, is_final_province, unlock_condition_count, display_order)
values ('00000000-0000-0000-0000-000000000001', 'テスト国', 'テスト地方', false, null, 1)
on conflict (name) do nothing;

insert into warlords (id, province_id, name, rarity, slot_type)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'テスト武将(足軽)', '足軽級', 'common'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'テスト武将(侍)', '侍級', 'mid'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'テスト武将(軍師)', '軍師級', 'rare')
on conflict (id) do nothing;

-- HMAC連携テスト(§10)向け: 既知のhmac_secretを持つ有効な連携設定。
-- テストコード側(tests/integration/support/hmac.ts)がこの値を使って署名を計算する。
insert into sen_no_kuni_hub_settings (key_id, hmac_secret, system_key, enabled)
values ('test-key-id', 'test-hmac-secret-do-not-use-in-production', 'sen-no-kuni-hub-test', true)
on conflict (key_id) do nothing;

-- Stripe Webhook統合テスト(§8)は実際のStripe test mode secret/webhook secretを要する。
-- ローカル環境変数(STRIPE_TEST_SECRET_KEY / STRIPE_TEST_WEBHOOK_SECRET)経由でpayment_settings
-- を更新してから実行すること(このファイルにはStripeの鍵情報を含めない)。
