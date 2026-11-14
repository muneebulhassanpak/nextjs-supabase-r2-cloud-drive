#!/usr/bin/env bash
# Proves every RLS policy is covered by a test. For each policy in `public` it runs the pgTAP suite
# twice against the local database: once with the policy dropped (allowed actions must start
# failing) and once with it opened up to `true` (forbidden actions must start succeeding).
# A mutation that leaves the suite green means a policy nothing checks. The original policy is
# put back after each run. Needs the local stack (`pnpm db:start`); takes a few minutes.
set -euo pipefail

# The first project_id is the local project's; the [remotes.*] sections have their own.
DB_CONTAINER="supabase_db_$(awk -F'"' '/^project_id = /{print $2; exit}' supabase/config.toml)"
psql() { docker exec "$DB_CONTAINER" psql -U postgres -qtAX -v ON_ERROR_STOP=1 -c "$1"; }

policy_sql() { # $1 table, $2 policy, $3 "real" | "open"
  psql "select format('create policy %I on public.%I for %s to %s', policyname, tablename, cmd, array_to_string(roles, ', '))
    || case when qual is null then '' when '$3' = 'open' then ' using (true)' else ' using (' || qual || ')' end
    || case when with_check is null then '' when '$3' = 'open' then ' with check (true)' else ' with check (' || with_check || ')' end
    from pg_policies where schemaname = 'public' and tablename = '$1' and policyname = '$2'"
}

# Read the list first: a failing query inside `< <(...)` wouldn't stop the script.
policies=$(psql "select tablename || E'\t' || policyname from pg_policies where schemaname = 'public' order by tablename, policyname")
if [[ -z $policies ]]; then
  echo "No policies found in public; is the local stack running?" >&2
  exit 1
fi

# A suite that already fails would make every mutation look caught.
if ! pnpm exec supabase test db </dev/null >/dev/null 2>&1; then
  echo "The pgTAP suite fails before any mutation; fix that first (pnpm db:test)." >&2
  exit 1
fi

# Whatever happens (Ctrl-C, a failed step), put the policy being mutated back as it was.
restore_table=""
restore_policy=""
restore_sql=""
restore() {
  if [[ -n $restore_sql ]]; then
    psql "drop policy if exists \"$restore_policy\" on public.$restore_table" >/dev/null 2>&1 || true
    psql "$restore_sql" >/dev/null && echo "Restored $restore_table: $restore_policy" >&2
  fi
}
trap restore EXIT
trap 'exit 130' INT TERM

missed=0
checked=0
while IFS=$'\t' read -r table policy; do
  original=$(policy_sql "$table" "$policy" real)
  opened=$(policy_sql "$table" "$policy" open)
  restore_table=$table restore_policy=$policy restore_sql=$original
  for mode in dropped open; do
    psql "drop policy \"$policy\" on public.$table" >/dev/null
    if [[ $mode == open ]]; then psql "$opened" >/dev/null; fi
    if pnpm exec supabase test db </dev/null >/dev/null 2>&1; then
      echo "MISSED  $mode  $table: $policy"
      missed=$((missed + 1))
    else
      echo "caught  $mode  $table: $policy"
    fi
    psql "drop policy if exists \"$policy\" on public.$table" >/dev/null 2>&1
    psql "$original" >/dev/null
    checked=$((checked + 1))
  done
  restore_sql=""
done <<<"$policies"

if ((missed > 0)); then
  echo "$missed mutation(s) went unnoticed: add tests for them." >&2
  exit 1
fi
echo "All $checked policy mutations were caught."
