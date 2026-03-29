-- Per-user switch: when false, posts are not auto-tagged into modules by AI (manual only).
-- Run in Supabase SQL Editor.

alter table public.profiles add column if not exists modules_ai_enabled boolean not null default true;

comment on column public.profiles.modules_ai_enabled is 'When false, skip Claude module classification; user assigns modules manually.';
