-- Run in Supabase → SQL Editor if deleting a post does nothing or shows a policy error.
-- Lets signed-in users delete only rows they own (same idea as UPDATE).

alter table public.posts enable row level security;

drop policy if exists "posts_delete_own" on public.posts;

create policy "posts_delete_own"
on public.posts
for delete
to authenticated
using (auth.uid() = user_id);
