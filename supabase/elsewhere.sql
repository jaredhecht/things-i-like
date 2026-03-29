-- Elsewhere: optional links to other web presences (Settings → Elsewhere, globe on profile when enabled).
-- Run once in Supabase SQL Editor.

alter table public.profiles add column if not exists elsewhere_visible boolean not null default false;

create table if not exists public.elsewhere_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (
    platform in (
      'twitter',
      'linkedin',
      'substack',
      'instagram',
      'tiktok',
      'website',
      'other'
    )
  ),
  slug text not null,
  label text,
  favicon_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint elsewhere_links_slug_length check (char_length(slug) <= 2000),
  constraint elsewhere_links_label_length check (label is null or char_length(label) <= 120)
);

create index if not exists elsewhere_links_user_sort_idx on public.elsewhere_links (user_id, sort_order);

alter table public.elsewhere_links enable row level security;

drop policy if exists "elsewhere_links_select" on public.elsewhere_links;
create policy "elsewhere_links_select"
on public.elsewhere_links for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profiles p
    where p.id = elsewhere_links.user_id
      and p.elsewhere_visible = true
  )
);

drop policy if exists "elsewhere_links_insert_own" on public.elsewhere_links;
create policy "elsewhere_links_insert_own"
on public.elsewhere_links for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "elsewhere_links_update_own" on public.elsewhere_links;
create policy "elsewhere_links_update_own"
on public.elsewhere_links for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "elsewhere_links_delete_own" on public.elsewhere_links;
create policy "elsewhere_links_delete_own"
on public.elsewhere_links for delete to authenticated
using (auth.uid() = user_id);
