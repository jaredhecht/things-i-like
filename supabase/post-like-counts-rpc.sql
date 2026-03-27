-- Public like counts for profile pages (anon cannot SELECT post_likes under RLS).
-- Run in Supabase SQL Editor after schema-social-v1.sql.

create or replace function public.post_like_counts(post_ids uuid[])
returns table (post_id uuid, like_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select pl.post_id, count(*)::bigint
  from public.post_likes pl
  where post_ids is not null
    and cardinality(post_ids) > 0
    and pl.post_id = any(post_ids)
  group by pl.post_id;
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.post_like_counts(uuid[]) to anon, authenticated;
