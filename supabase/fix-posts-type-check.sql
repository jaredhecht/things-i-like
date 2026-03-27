-- Fix: "violates check constraint posts_type_check" when posting images (or video/audio).
-- The app sends these type values; your table must allow them all.

alter table public.posts drop constraint if exists posts_type_check;

alter table public.posts
  add constraint posts_type_check check (
    type in (
      'text',
      'quote',
      'image',
      'youtube',
      'video',
      'spotify',
      'soundcloud',
      'audio',
      'article'
    )
  );
