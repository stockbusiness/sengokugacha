-- sengoku-ai.com 外部開発者向け連携ガイド 9〜10章(共通顧客ID・紹介/成果連携)対応。
-- 現時点ではカラム追加のみで、既存の登録・購入フローの挙動は一切変えない
-- (users.common_user_idが未設定のユーザーは従来通り動作する)。

-- 共通顧客ID(sengoku-ai.com側で発行される横断ID)。POST /api/common-users/resolveの
-- 結果を保存する。未解決の間はnullのまま(=既存ユーザーへの遡及発行は別途バッチで対応)。
alter table users add column common_user_id text;
alter table users add column common_user_synced_at timestamptz;

-- 重複紐付けを防ぐ(1つのcommon_user_idにつき戦国パスポート側ユーザーは1人まで)。
create unique index uq_users_common_user_id on users(common_user_id) where common_user_id is not null;

-- POST /api/referrals/captureで受け取ったreferral_session_key。LIFFのref流入時点で
-- 取得し、後続のPOST /api/referrals/confirm(登録確定・購入確定時)で再利用する。
alter table users add column referral_session_key text;
