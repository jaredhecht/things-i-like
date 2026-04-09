-- Weekly digest preferences for server-rendered Happening Things emails.
-- Run once in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists weekly_digest_enabled boolean not null default true;
