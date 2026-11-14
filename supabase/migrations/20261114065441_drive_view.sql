-- How each person likes to see their files: as a grid or a list. NULL means "not chosen yet" (the app
-- shows a list, which works on every screen size). Only the person themself can change it.

create type public.drive_view as enum ('grid', 'list');

alter table public.profiles add column drive_view public.drive_view;

comment on column public.profiles.drive_view is 'Grid or list; NULL until the person chooses.';

grant update (drive_view) on public.profiles to authenticated;
