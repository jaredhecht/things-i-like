-- When the author removes a post from a module, we record that so AI classification
-- does not immediately put it back. Run in Supabase SQL Editor after modules.sql.

create table if not exists public.post_modules_ai_suppressed (
  post_id uuid not null references public.posts (id) on delete cascade,
  module_id uuid not null references public.profile_modules (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, module_id)
);

create index if not exists post_modules_ai_suppressed_module_idx
  on public.post_modules_ai_suppressed (module_id);

alter table public.post_modules_ai_suppressed enable row level security;

drop policy if exists "post_modules_ai_suppressed_select_own" on public.post_modules_ai_suppressed;
create policy "post_modules_ai_suppressed_select_own"
on public.post_modules_ai_suppressed for select to authenticated
using (
  exists (select 1 from public.posts p where p.id = post_modules_ai_suppressed.post_id and p.user_id = auth.uid())
);

drop policy if exists "post_modules_ai_suppressed_insert_own" on public.post_modules_ai_suppressed;
create policy "post_modules_ai_suppressed_insert_own"
on public.post_modules_ai_suppressed for insert to authenticated
with check (
  exists (select 1 from public.posts p where p.id = post_modules_ai_suppressed.post_id and p.user_id = auth.uid())
);

drop policy if exists "post_modules_ai_suppressed_delete_own" on public.post_modules_ai_suppressed;
create policy "post_modules_ai_suppressed_delete_own"
on public.post_modules_ai_suppressed for delete to authenticated
using (
  exists (select 1 from public.posts p where p.id = post_modules_ai_suppressed.post_id and p.user_id = auth.uid())
);
