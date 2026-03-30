-- Fix "Database error deleting user" (Settings → Delete account).
-- Run the whole file in Supabase → SQL Editor.
--
-- Postgres blocks deleting auth.users while any public table references it with
-- ON DELETE NO ACTION / RESTRICT. SET NULL and CASCADE are already fine.
--
-- Optional: see what will be changed (run alone first)
/*
select
  cl.relname as table_name,
  c.conname as constraint_name,
  case c.confdeltype
    when 'c' then 'CASCADE'
    when 's' then 'SET NULL'
    when 'n' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'a' then 'NO ACTION'
    else c.confdeltype::text
  end as on_delete
from pg_constraint c
join pg_class cl on cl.oid = c.conrelid
join pg_namespace n on n.oid = cl.relnamespace
where c.contype = 'f'
  and c.confrelid = 'auth.users'::regclass
  and n.nspname = 'public'
order by cl.relname, c.conname;
*/

-- Auto-fix: every public FK → auth.users that is not already CASCADE or SET NULL.
-- Only single-column foreign keys (normal for user id references).
do $$
declare
  r record;
  fk_cols text;
  ref_col text;
begin
  for r in
    select
      c.oid,
      c.conname,
      c.conrelid,
      c.conkey,
      c.confkey,
      c.confrelid as ref_table_oid
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and n.nspname = 'public'
      and c.confdeltype not in ('c'::"char", 's'::"char")
      and array_length(c.conkey, 1) = 1
  loop
    select string_agg(quote_ident(a.attname), ', ' order by u.ord)
    into fk_cols
    from unnest(r.conkey) with ordinality as u(attnum, ord)
    join pg_attribute a on a.attrelid = r.conrelid and a.attnum = u.attnum and not a.attisdropped;

    select quote_ident(a.attname)
    into ref_col
    from pg_attribute a
    where a.attrelid = r.ref_table_oid and a.attnum = r.confkey[1] and not a.attisdropped;

    if ref_col is null or ref_col <> quote_ident('id') then
      raise notice 'Skipping % on %: reference is not auth.users(id)', r.conname, r.conrelid::regclass;
      continue;
    end if;

    execute format('alter table %s drop constraint %I', r.conrelid::regclass, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%s) references auth.users(id) on delete cascade',
      r.conrelid::regclass,
      r.conname,
      fk_cols
    );
    raise notice 'ON DELETE CASCADE: %.%', r.conrelid::regclass, r.conname;
  end loop;
end $$;
