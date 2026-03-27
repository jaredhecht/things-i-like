-- In-app notifications (follow + like). Run in Supabase SQL Editor.
-- Enable Realtime for `public.notifications` in Dashboard → Database → Replication if you want instant updates.
-- If trigger creation errors on "procedure", change `execute procedure` to `execute function` (Postgres 14+).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('follow', 'like')),
  actor_id uuid references auth.users (id) on delete set null,
  post_id uuid references public.posts (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;

create policy "notifications_select_own"
on public.notifications for select to authenticated
using (user_id = auth.uid());

create policy "notifications_update_own"
on public.notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Follow → notify the person being followed
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, actor_id)
  values (new.following_id, 'follow', new.follower_id);
  return new;
end;
$$;

drop trigger if exists follows_create_notification on public.follows;
create trigger follows_create_notification
after insert on public.follows
for each row execute procedure public.notify_on_follow();

-- Like → notify post owner (not self-likes)
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select p.user_id into owner_id from public.posts p where p.id = new.post_id;
  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, post_id)
  values (owner_id, 'like', new.user_id, new.post_id);
  return new;
end;
$$;

drop trigger if exists post_likes_create_notification on public.post_likes;
create trigger post_likes_create_notification
after insert on public.post_likes
for each row execute procedure public.notify_on_post_like();
