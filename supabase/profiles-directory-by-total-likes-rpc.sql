-- Public "Who's Here" directory:
-- only users who have posted at least once, ranked by cumulative likes received.

create or replace function public.profiles_directory_by_total_likes()
returns table (
  id uuid,
  username text,
  avatar_url text,
  post_count bigint,
  received_like_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.avatar_url,
    count(distinct po.id)::bigint as post_count,
    count(pl.post_id)::bigint as received_like_count
  from public.profiles p
  join public.posts po on po.user_id = p.id
  left join public.post_likes pl on pl.post_id = po.id
  group by p.id, p.username, p.avatar_url
  order by received_like_count desc, post_count desc, p.username asc;
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.profiles_directory_by_total_likes() to anon, authenticated;
