-- First-ever post time per user; used by weekly Happening Things email (run in SQL Editor once).
-- Returns user_ids whose first post falls in [window_start, window_end).

create or replace function public.happening_first_post_users_in_window(
  window_start timestamptz,
  window_end timestamptz
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id
  from public.posts p
  where p.user_id is not null
  group by p.user_id
  having min(p.created_at) >= window_start
     and min(p.created_at) < window_end;
$$;

revoke all on function public.happening_first_post_users_in_window(timestamptz, timestamptz) from public;
grant execute on function public.happening_first_post_users_in_window(timestamptz, timestamptz) to service_role;
