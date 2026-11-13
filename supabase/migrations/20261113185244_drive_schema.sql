-- Drive data model: profiles, the item tree, sharing, stars, recents and the activity log.
-- Access rules are in the next migration; every table here has RLS on and starts with no grants
-- for API roles, so nothing is reachable until a policy and a grant say so.

-- Types --------------------------------------------------------------------------------------------

create type public.item_kind as enum ('folder', 'file');

-- `pending` while the browser uploads to storage; `ready` once the upload is confirmed.
create type public.item_status as enum ('pending', 'ready');

create type public.item_category as enum (
  'image', 'video', 'audio', 'pdf', 'document', 'spreadsheet', 'presentation', 'text', 'archive', 'other'
);

-- What a share grants. `access_role` adds `owner` and is ordered weakest to strongest, so
-- `max()` picks the strongest when a user has several ways in.
create type public.share_role as enum ('viewer', 'editor');
create type public.access_role as enum ('viewer', 'editor', 'owner');

create type public.activity_action as enum (
  'created', 'uploaded', 'renamed', 'moved', 'trashed', 'restored',
  'shared', 'share_changed', 'unshared', 'link_created', 'link_revoked'
);

-- Profiles -----------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 100),
  avatar_url text check (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://'),
  -- Bytes of every file the user owns, pending uploads included. Kept by triggers on `items`.
  storage_used bigint not null default 0 check (storage_used >= 0),
  storage_quota bigint not null default 104857600 check (storage_quota > 0), -- 100 MB
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per user, created when they sign up.';

-- Items: files and folders in one tree --------------------------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id uuid references public.items (id) on delete cascade,
  kind public.item_kind not null,
  name text not null,
  -- Every folder above this item, root first. Set by triggers, so a share on any folder can cover
  -- everything inside it with one indexed lookup.
  ancestors uuid[] not null default '{}',
  size bigint,
  mime_type text,
  category public.item_category generated always as (
    case
      when kind = 'folder' then null
      when mime_type like 'image/%' then 'image'::public.item_category
      when mime_type like 'video/%' then 'video'::public.item_category
      when mime_type like 'audio/%' then 'audio'::public.item_category
      when mime_type = 'application/pdf' then 'pdf'::public.item_category
      when mime_type in (
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.oasis.opendocument.text',
        'application/rtf'
      ) then 'document'::public.item_category
      when mime_type in (
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.oasis.opendocument.spreadsheet'
      ) then 'spreadsheet'::public.item_category
      when mime_type in (
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.oasis.opendocument.presentation'
      ) then 'presentation'::public.item_category
      when mime_type like 'text/%' or mime_type in (
        'application/json', 'application/xml', 'application/javascript', 'application/sql',
        'application/x-sh', 'application/yaml', 'application/toml'
      ) then 'text'::public.item_category
      when mime_type in (
        'application/zip', 'application/gzip', 'application/x-tar', 'application/x-7z-compressed',
        'application/vnd.rar'
      ) then 'archive'::public.item_category
      else 'other'::public.item_category
    end
  ) stored,
  -- Random storage key, never derived from the file name.
  object_key text unique,
  status public.item_status not null default 'ready',
  trashed_at timestamptz,
  trashed_by uuid references public.profiles (id) on delete set null,
  -- The item the user put in the trash; everything trashed with it shares this id, so restoring it
  -- brings back exactly what went in together. No foreign key: it's a marker, and a cascade on it
  -- would fight the parent cascade when a folder is deleted.
  trash_root uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,

  constraint items_name_valid check (
    char_length(name) between 1 and 255
    and name = btrim(name)
    and name !~ '[[:cntrl:]/]'
    and name not in ('.', '..')
  ),
  constraint items_kind_fields check (
    case kind
      when 'folder' then size is null and mime_type is null and object_key is null and status = 'ready'
      else size is not null and mime_type is not null and object_key is not null
    end
  ),
  constraint items_size_limit check (size between 0 and 26214400), -- 25 MB per file
  constraint items_mime_type_valid check (
    char_length(mime_type) <= 255 and mime_type ~ '^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'
  ),
  constraint items_object_key_valid check (char_length(object_key) <= 512),
  constraint items_ancestors_match_parent check (
    case
      when parent_id is null then cardinality(ancestors) = 0
      else ancestors[cardinality(ancestors)] = parent_id
    end
  ),
  constraint items_not_own_ancestor check (not (id = any (ancestors))),
  constraint items_depth_limit check (cardinality(ancestors) <= 50),
  constraint items_trash_fields check ((trashed_at is null) = (trash_root is null))
);

comment on table public.items is 'Files and folders. A file''s bytes live in object storage under object_key.';

create index items_owner_id_idx on public.items (owner_id);
create index items_parent_id_idx on public.items (parent_id);
create index items_ancestors_idx on public.items using gin (ancestors);
create index items_name_trgm_idx on public.items using gin (name extensions.gin_trgm_ops);
create index items_trash_root_idx on public.items (trash_root) where trash_root is not null;
create index items_trashed_by_idx on public.items (trashed_by) where trashed_by is not null;
create index items_updated_by_idx on public.items (updated_by) where updated_by is not null;
create index items_pending_idx on public.items (created_at) where status = 'pending';

-- Names are unique within a folder (and within each user's root), ignoring case, among items that
-- are visible in the folder: not trashed and fully uploaded.
create unique index items_name_unique_in_folder on public.items (parent_id, lower(name))
  where parent_id is not null and trashed_at is null and status = 'ready';
create unique index items_name_unique_at_root on public.items (owner_id, lower(name))
  where parent_id is null and trashed_at is null and status = 'ready';

-- Sharing ------------------------------------------------------------------------------------------

-- A share on a folder covers everything inside it.
create table public.item_shares (
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.share_role not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create index item_shares_user_id_idx on public.item_shares (user_id);
create index item_shares_created_by_idx on public.item_shares (created_by);

-- Shares to an email with no confirmed account yet. Turned into item_shares once that email is
-- confirmed.
create table public.share_invites (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  email text not null check (
    char_length(email) <= 320 and email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
  ),
  role public.share_role not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_id, email)
);

create index share_invites_email_idx on public.share_invites (email);
create index share_invites_created_by_idx on public.share_invites (created_by);

-- Public view-only links. Only the SHA-256 of the token is stored; the token itself is shown once.
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index share_links_item_id_idx on public.share_links (item_id);
create index share_links_created_by_idx on public.share_links (created_by);

-- Per-user lists -----------------------------------------------------------------------------------

create table public.stars (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index stars_item_id_idx on public.stars (item_id);

create table public.recents (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  touched_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index recents_user_touched_idx on public.recents (user_id, touched_at desc);
create index recents_item_id_idx on public.recents (item_id);

-- Activity log -------------------------------------------------------------------------------------

-- Written only by triggers. clock_timestamp() keeps the order of several events in one transaction.
create table public.activity (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action public.activity_action not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);

create index activity_item_created_idx on public.activity (item_id, created_at desc);
create index activity_actor_id_idx on public.activity (actor_id) where actor_id is not null;

-- Lock everything down -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.item_shares enable row level security;
alter table public.share_invites enable row level security;
alter table public.share_links enable row level security;
alter table public.stars enable row level security;
alter table public.recents enable row level security;
alter table public.activity enable row level security;

-- Supabase grants API roles everything on new tables by default. Take it all back; the access
-- rules migration grants exactly what each table needs.
revoke all on
  public.profiles, public.items, public.item_shares, public.share_invites, public.share_links,
  public.stars, public.recents, public.activity
from anon, authenticated;
