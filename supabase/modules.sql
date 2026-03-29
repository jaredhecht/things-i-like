-- Profile modules (horizontal rails) + AI / user post assignments.
-- Run once in Supabase SQL Editor.

create table if not exists public.profile_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profile_modules_name_len check (char_length(name) >= 1 and char_length(name) <= 80)
);

create index if not exists profile_modules_user_sort_idx on public.profile_modules (user_id, sort_order);

create table if not exists public.post_modules_user (
  post_id uuid not null references public.posts (id) on delete cascade,
  module_id uuid not null references public.profile_modules (id) on delete cascade,
  primary key (post_id, module_id)
);

create index if not exists post_modules_user_module_idx on public.post_modules_user (module_id);

create table if not exists public.post_modules_ai (
  post_id uuid not null references public.posts (id) on delete cascade,
  module_id uuid not null references public.profile_modules (id) on delete cascade,
  primary key (post_id, module_id)
);

create index if not exists post_modules_ai_module_idx on public.post_modules_ai (module_id);

alter table public.profile_modules enable row level security;
alter table public.post_modules_user enable row level security;
alter table public.post_modules_ai enable row level security;

drop policy if exists "profile_modules_select" on public.profile_modules;
create policy "profile_modules_select"
on public.profile_modules for select
using (true);

drop policy if exists "profile_modules_insert_own" on public.profile_modules;
create policy "profile_modules_insert_own"
on public.profile_modules for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profile_modules_update_own" on public.profile_modules;
create policy "profile_modules_update_own"
on public.profile_modules for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "profile_modules_delete_own" on public.profile_modules;
create policy "profile_modules_delete_own"
on public.profile_modules for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "post_modules_user_select" on public.post_modules_user;
create policy "post_modules_user_select"
on public.post_modules_user for select
using (exists (select 1 from public.posts p where p.id = post_modules_user.post_id));

drop policy if exists "post_modules_user_insert_own" on public.post_modules_user;
create policy "post_modules_user_insert_own"
on public.post_modules_user for insert to authenticated
with check (
  exists (select 1 from public.posts p where p.id = post_modules_user.post_id and p.user_id = auth.uid())
);

drop policy if exists "post_modules_user_delete_own" on public.post_modules_user;
create policy "post_modules_user_delete_own"
on public.post_modules_user for delete to authenticated
using (
  exists (select 1 from public.posts p where p.id = post_modules_user.post_id and p.user_id = auth.uid())
);

drop policy if exists "post_modules_ai_select" on public.post_modules_ai;
create policy "post_modules_ai_select"
on public.post_modules_ai for select
using (exists (select 1 from public.posts p where p.id = post_modules_ai.post_id));

drop policy if exists "post_modules_ai_insert_own" on public.post_modules_ai;
create policy "post_modules_ai_insert_own"
on public.post_modules_ai for insert to authenticated
with check (
  exists (select 1 from public.posts p where p.id = post_modules_ai.post_id and p.user_id = auth.uid())
);

drop policy if exists "post_modules_ai_delete_own" on public.post_modules_ai;
create policy "post_modules_ai_delete_own"
on public.post_modules_ai for delete to authenticated
using (
  exists (select 1 from public.posts p where p.id = post_modules_ai.post_id and p.user_id = auth.uid())
);
