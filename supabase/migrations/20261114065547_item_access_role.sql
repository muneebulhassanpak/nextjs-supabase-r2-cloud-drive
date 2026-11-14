-- What the signed-in person may do with an item: 'owner', 'editor', 'viewer', or NULL when they can't
-- see it (the same answer as for an id that doesn't exist, so it reveals nothing). The app uses it to
-- show only the actions that will work; the rules themselves are still enforced by RLS and the API
-- functions.

create function public.item_access_role(p_item_id uuid)
returns public.access_role
language sql
stable
security definer
set search_path = ''
as $$
  select private.item_access(p_item_id) where (select auth.uid()) is not null
$$;

revoke execute on function public.item_access_role(uuid) from public, anon, authenticated;
grant execute on function public.item_access_role(uuid) to authenticated;
