-- Run in Supabase → SQL Editor if edits show an alert about "no rows updated"
-- or if updates appear to do nothing. RLS often allows INSERT/SELECT but not UPDATE.

alter table public.posts enable row level security;

drop policy if exists "posts_update_own" on public.posts;

create policy "posts_update_own"
on public.posts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
