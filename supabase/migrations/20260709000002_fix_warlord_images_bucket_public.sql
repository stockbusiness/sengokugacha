-- 20260708000012_warlord_images_storage_bucket.sql は
-- `on conflict (id) do nothing` のため、バケットが一度でも非公開(public=false)の
-- 状態で作成されていた場合、再実行しても public に修正されない不具合があった。
-- 武将画像アップロード後にLIFF側で画像が表示されない(壊れた画像として表示される)
-- 事象の原因となっていたため、既存バケットに対しても必ず public=true を
-- 適用するように修正する。

update storage.buckets set public = true where id = 'warlord-images';

insert into storage.buckets (id, name, public)
values ('warlord-images', 'warlord-images', true)
on conflict (id) do update set public = true;
