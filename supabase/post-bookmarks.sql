-- Bookmarks: save other people's posts (run in Supabase SQL Editor).

create table if not exists public.post_bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists post_bookmarks_post_id_idx on public.post_bookmarks (post_id);

alter table public.post_bookmarks enable row level security;

drop policy if exists "post_bookmarks_select_own" on public.post_bookmarks;
drop policy if exists "post_bookmarks_insert_own" on public.post_bookmarks;
drop policy if exists "post_bookmarks_delete_own" on public.post_bookmarks;

create policy "post_bookmarks_select_own"
on public.post_bookmarks for select to authenticated
using (user_id = auth.uid());

create policy "post_bookmarks_insert_own"
on public.post_bookmarks for insert to authenticated
with check (user_id = auth.uid());

create policy "post_bookmarks_delete_own"
on public.post_bookmarks for delete to authenticated
using (user_id = auth.uid());
