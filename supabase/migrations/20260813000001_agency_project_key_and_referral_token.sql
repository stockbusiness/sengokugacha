-- sengoku-ai.com開発者からの2026-08-03回答を受けた2点の追加。

-- 1) project_key(案件識別子)。回答Q3より、referrals/capture・confirmでは必須ではないが
--    「送信可能な場合は併せて送ることを推奨」とされた。値は代理店システム側の
--    projects[].slug と同じ(例: sengoku-influencer)。どの案件として送るかは運用判断
--    のため、環境変数ではなく管理画面から設定できる形にする。
--    nullのときは project_key を送らない(先方の既定動作=referral_tokenに紐づく
--    プロジェクトへ記録される、に委ねる)。
alter table agency_integration_settings add column if not exists default_project_key text;

-- 2) 紹介トークンの保存。回答Q4より、capture を経由せず confirm に referral_token を
--    直接渡す経路が正式にサポートされていることが確認できた。
--    従来は capture が失敗すると referral_session_key が得られず、その利用者の紹介確定
--    (=代理店への成果紐づけ)が永久に行えなかった。生のトークンを持っておくことで、
--    capture 失敗時でも confirm でフォールバックできるようにする。
alter table users add column if not exists referral_token text;

comment on column users.referral_token is
  '紹介URL(?ref=)で受け取った生のreferral_token。referral_session_keyが取得できなかった場合にreferrals/confirmへ直接渡すためのフォールバック用。';
