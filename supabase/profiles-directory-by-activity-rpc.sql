-- Onboarding: list all profiles with post counts, most active first (run in Supabase SQL Editor).

create or replace function public.profiles_directory_by_activity()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  post_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    count(po.id)::bigint as post_count
  from public.profiles p
  left join public.posts po on po.user_id = p.id
  group by p.id, p.username, p.display_name, p.avatar_url
  order by post_count desc, p.username asc;
$$;

grant execute on function public.profiles_directory_by_activity() to authenticated;
