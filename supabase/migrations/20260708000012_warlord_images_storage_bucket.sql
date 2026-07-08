-- 武将画像をアップロードできるようにするためのSupabase Storageバケット。
-- public: true にすることで、アップロードされた画像をLIFFアプリから
-- 認証不要で直接読み込める(RLSのselectポリシー追加は不要)。
-- アップロード自体は管理画面のAPI経由でservice roleキーを使って行うため、
-- insert/update/delete用のポリシーは追加しない(anon/authenticatedからの
-- 直接書き込みは常に拒否される)。
insert into storage.buckets (id, name, public)
values ('warlord-images', 'warlord-images', true)
on conflict (id) do nothing;
