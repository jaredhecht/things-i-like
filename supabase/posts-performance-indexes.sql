-- Optional: speeds up feed and profile post lists as data grows.
-- Run once in Supabase → SQL Editor if you don’t already have equivalent indexes.

create index if not exists posts_user_id_created_at_desc
  on public.posts (user_id, created_at desc);

-- Tag queries use contains(tags, ...); post-tags.sql may already create posts_tags_gin.
-- If tag pages feel slow at scale, analyze with EXPLAIN and adjust.
