-- Post tags (max 2 per post). Run once in Supabase → SQL Editor.

alter table public.posts add column if not exists tags text[] not null default '{}';

alter table public.posts drop constraint if exists posts_tags_max_two;
alter table public.posts add constraint posts_tags_max_two check (cardinality(tags) <= 2);

create index if not exists posts_tags_gin on public.posts using gin (tags);
