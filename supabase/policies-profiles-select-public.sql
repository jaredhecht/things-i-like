-- Allow anyone (including anon) to read profiles so public /username pages can resolve display info.
-- Run in Supabase SQL Editor if profile rows are not visible to the anon key.

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
on public.profiles for select
using (true);
