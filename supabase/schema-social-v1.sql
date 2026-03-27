-- Social layer: follows, likes, rethings (run once in Supabase SQL Editor).
-- Also extends posts for rething attribution.

-- ── posts: link back to original when this row is a rething ─────────────
alter table public.posts add column if not exists rething_of_post_id uuid references public.posts (id) on delete set null;
alter table public.posts add column if not exists rething_from_username text;

-- ── follows ────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

alter table public.follows enable row level security;

drop policy if exists "follows_select_own" on public.follows;
drop policy if exists "follows_insert_self" on public.follows;
drop policy if exists "follows_delete_self" on public.follows;

create policy "follows_select_own"
on public.follows for select to authenticated
using (follower_id = auth.uid() or following_id = auth.uid());

create policy "follows_insert_self"
on public.follows for insert to authenticated
with check (follower_id = auth.uid());

create policy "follows_delete_self"
on public.follows for delete to authenticated
using (follower_id = auth.uid());

-- ── post likes ─────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.post_likes enable row level security;

drop policy if exists "post_likes_select_authenticated" on public.post_likes;
drop policy if exists "post_likes_insert_self" on public.post_likes;
drop policy if exists "post_likes_delete_self" on public.post_likes;

create policy "post_likes_select_authenticated"
on public.post_likes for select to authenticated
using (true);

create policy "post_likes_insert_self"
on public.post_likes for insert to authenticated
with check (user_id = auth.uid());

create policy "post_likes_delete_self"
on public.post_likes for delete to authenticated
using (user_id = auth.uid());

-- ── posts: allow public read (needed for /username blogs) ──────────────
-- If you already have a SELECT policy, adjust instead of duplicating.
drop policy if exists "posts_select_public" on public.posts;
create policy "posts_select_public"
on public.posts for select
using (true);

-- Ensure authenticated users can still insert their own posts (keep your existing insert policy).
-- If insert fails after this, add:
-- create policy "posts_insert_own" on public.posts for insert to authenticated with check (auth.uid() = user_id);
