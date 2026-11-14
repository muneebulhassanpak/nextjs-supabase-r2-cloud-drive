-- Profile pictures live in storage next to files, under `a/<user id>/<random id>`. The column holds
-- that key, never a URL: the app signs a short-lived link for whoever may see the profile.
--
-- It replaces `avatar_url`, which nothing used yet and which let anyone point their picture at any
-- https address (a way to log the IP of everyone who looks at it).

alter table public.profiles drop column avatar_url;

alter table public.profiles add column avatar_key text
  -- Only keys under the person's own avatar folder: their profile can't point at someone's files.
  constraint profiles_avatar_key_own check (
    avatar_key ~ ('^a/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  );

comment on column public.profiles.avatar_key is
  'Storage key of the profile picture (a/<id>/<uuid>); NULL for none. Set by the app after upload.';

grant update (avatar_key) on public.profiles to authenticated;
