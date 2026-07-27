# 千ノ国パスポート Migration履歴正規化 実施結果(§5.1)

区分: 1.ソースコード確認済み / 2.local確認済み / 3.staging確認済み / 4.production未確認 / 5.未対応 / 6.問題あり / 7.管理者操作待ち / 8.Stripeアカウント待ち

`docs/PHASE_C1_MIGRATION_HISTORY_REPAIR_PLAN.md`の手順を、実際に`stockbusiness`がステージングDBのSupabase Dashboard SQL Editorから実行する。

## 実行するSQL(スマホ/PCでそのままコピペ可能)

### STEP 1: テーブル作成

```sql
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
```

### STEP 2: 全76ファイル分の履歴行をINSERT

このリストは、2つの未マージブランチ(`claude/sengoku-economy-os-j0d2nl`にのみ存在する`20260810000003`、および本ブランチで新規追加した`20260811000001`)を突き合わせて生成した、**現時点でステージングDBへ実際に適用済みの全76ファイルの正確な一覧**である(`main`マージ後は両方とも`supabase/migrations/`に存在するようになる)。

```sql
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260707000001', 'initial_schema'),
  ('20260707000002', 'seed_initial_master_data'),
  ('20260707000003', 'external_links'),
  ('20260707000004', 'achievements_selected_warlord'),
  ('20260707000005', 'payment_settings'),
  ('20260707000006', 'gacha_config_streak_bonus'),
  ('20260707000007', 'line_settings'),
  ('20260707000008', 'line_messaging_settings'),
  ('20260707000009', 'legal_pages_and_gacha_rate_tiers'),
  ('20260707000010', 'purchase_refund_agent_payout_support'),
  ('20260708000011', 'admin_audit_logs'),
  ('20260708000012', 'warlord_images_storage_bucket'),
  ('20260708000013', 'warlords_unique_slot_constraint'),
  ('20260709000001', 'faqs_and_announcements'),
  ('20260709000002', 'fix_warlord_images_bucket_public'),
  ('20260709000003', 'rich_menu_image_upload'),
  ('20260709000004', 'gacha_animations'),
  ('20260709000005', 'rich_menu_panels'),
  ('20260709000006', 'nation_dashboard_v2'),
  ('20260710000001', 'founder_migration_v21'),
  ('20260711000001', 'academy_market_events_v22'),
  ('20260712000001', 'economy_engine_v23'),
  ('20260713000001', 'repair_v20_v23_pending_schema'),
  ('20260714000001', 'metaverse_tour'),
  ('20260715000001', 'metaverse_default_images'),
  ('20260716000001', 'metaverse_scene_video'),
  ('20260717000001', 'agency_integration'),
  ('20260718000001', 'metaverse_map_hotspots'),
  ('20260719000001', 'metaverse_plot_coordinates'),
  ('20260720000001', 'ai_image_generation'),
  ('20260721000001', 'ai_image_gemini_provider'),
  ('20260722000001', 'warlord_skill_name'),
  ('20260723000001', 'ai_image_style_prompt_split'),
  ('20260724000001', 'warlord_ai_portrait_url'),
  ('20260725000001', 'castle_lord_plan_core'),
  ('20260726000001', 'castle_lord_plan_plots'),
  ('20260727000001', 'castle_lord_plan_purchase'),
  ('20260728000001', 'castle_lord_plan_commissions'),
  ('20260729000001', 'external_purchase_orders'),
  ('20260730000001', 'external_order_item_status'),
  ('20260731000001', 'conquest_rules'),
  ('20260801000001', 'castle_province_unlock'),
  ('20260802000001', 'common_user_hub'),
  ('20260803000001', 'stripe_safety_p0'),
  ('20260804000001', 'assigned_agent'),
  ('20260805000001', 'sen_no_kuni_hub_basis'),
  ('20260806000001', 'entitlements'),
  ('20260807000001', 'shopping_order_events'),
  ('20260807000002', 'purchase_grant_steps'),
  ('20260807000003', 'entitlements_reentrant'),
  ('20260807000004', 'integration_inbox_atomic_claim'),
  ('20260807000005', 'event_version'),
  ('20260807000006', 'shopping_order_events_source_key'),
  ('20260807000007', 'agency_event_recovery'),
  ('20260808000001', 'purchase_grant_step_atomic_claim'),
  ('20260808000002', 'purchase_balance_grant_transactional'),
  ('20260808000003', 'entitlement_atomic_claim'),
  ('20260808000004', 'stripe_webhook_event_atomic_claim'),
  ('20260808000005', 'sen_no_kuni_hub_signature_v2'),
  ('20260808000006', 'gacha_draw_atomic'),
  ('20260808000007', 'integration_recovery_soft_resolve'),
  ('20260808000008', 'unresolved_common_user_merges'),
  ('20260808000009', 'purchase_outbox'),
  ('20260808000010', 'unresolved_entitlements_dismissal'),
  ('20260809000001', 'grant_service_role_privileges'),
  ('20260809000002', 'fix_execute_gacha_draw_ambiguous_columns'),
  ('20260809000003', 'fix_entitlement_grant_premature_revoked_block'),
  ('20260809000004', 'fix_entitlement_revocation_premature_reversed'),
  ('20260809000005', 'entitlement_grant_respects_dismissal'),
  ('20260809000007', 'integration_inbox_atomic_claim_fencing'),
  ('20260809000008', 'outbox_atomic_claim_fencing'),
  ('20260809000009', 'revoke_public_execute_on_functions'),
  ('20260810000001', 'entitlement_grant_auto_reverses_when_already_revoked'),
  ('20260810000002', 'event_trigger_locks_down_new_functions'),
  ('20260810000003', 'revoke_anon_authenticated_function_execute'),
  ('20260811000001', 'common_user_resolution_attempts')
on conflict (version) do nothing;
```

**注意**: `20260811000001`はPR #149(ドラフト)がまだ`main`へマージされていない。この行は、PR #149のmigrationをステージングDBへ実際に適用した後にINSERTすること(適用前に履歴だけ先に記録すると、「履歴上は適用済みなのに実オブジェクトが無い」という逆向きの不整合を生む)。

### STEP 3: 検証

```sql
select count(*) from supabase_migrations.schema_migrations;
```

## 実施結果(実行後にここを更新)

| 項目 | 結果 | 区分 |
|---|---|---|
| STEP 1(テーブル作成) | 未実施 | 5 |
| STEP 2(全履歴行INSERT) | 未実施 | 5 |
| STEP 3(件数検証) | 未実施 | 5 |

`stockbusiness`が実行後、本セクションを実測結果で更新する。
