-- One-time setup: public bucket for post images + RLS so users upload only under their user id folder.
-- Run in Supabase → SQL Editor (confirm if warned about destructive changes).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post_images_public_read" on storage.objects;
drop policy if exists "post_images_authenticated_upload" on storage.objects;

-- Anyone can read (needed for <img src="..."> in the feed)
create policy "post_images_public_read"
on storage.objects
for select
using (bucket_id = 'post-images');

-- Logged-in users may upload only to post-images/{their uuid}/...
create policy "post_images_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
