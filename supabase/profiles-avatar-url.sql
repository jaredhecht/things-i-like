-- Store public avatar URL (e.g. Google picture) for feed/profile display.
-- Run once in Supabase SQL Editor.

alter table public.profiles add column if not exists avatar_url text;

-- Allow users to update their own row (needed to sync OAuth avatar).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
