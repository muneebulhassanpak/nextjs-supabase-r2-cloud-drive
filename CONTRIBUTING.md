# Contributing

## Branches and environments

| Branch              | Deploys to                                | Database                    |
| ------------------- | ----------------------------------------- | --------------------------- |
| feature branches    | a Vercel preview per pull request         | staging                     |
| `develop` (default) | staging: `staging.lockerly.heymuneeb.dev` | Supabase `lockerly-staging` |
| `main`              | production: `lockerly.heymuneeb.dev`      | Supabase `lockerly-prod`    |

Both `develop` and `main` are protected: every change goes through a pull request, and direct pushes are rejected.

## Workflow

1. Open or pick an issue. Each issue belongs to a phase milestone.
2. Branch from `develop`: `<type>/<phase>-<short-desc>`, for example `feat/05-uploads`.
3. Make small commits, one logical step each, with its tests. Every commit passes lint, format and type checks on its own.
4. Open a PR into `develop`, fill in the template and link the issue (`Closes #12`).
5. CI must pass: `lint`, `typecheck`, `test`, `db`, `build`, `e2e`, `pr-title` and `commit-messages`. Review conversations must be resolved.
6. PRs into `develop` are **rebase-merged**, so history stays linear. Squash fixup commits first. The branch is deleted after merge.
7. Merging into `develop` applies new migrations to staging and deploys the staging site.

### Releases

1. Check the change on staging.
2. Open a PR from `develop` into `main` titled `chore(release): vX.Y.Z`, with the changelog section as its body.
3. Merge it with a **merge commit**, so each release is one visible point on `main`. CI applies migrations to production and Vercel deploys it.
4. Tag the merge commit `vX.Y.Z` and publish a GitHub Release.

PRs into `main` must come from `develop` or `hotfix/*` (the `release-source` check). After a hotfix, merge `main` back into `develop`.

## Commit messages and PR titles

Both follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <subject>

<optional body: why, not what>
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `revert`.
Scopes: `auth`, `files`, `folders`, `upload`, `preview`, `sharing`, `trash`, `search`, `activity`, `demo`, `db`, `rls`, `storage`, `ui`, `ci`, `release`.
Subjects start lowercase, have no trailing period, and stay under 100 characters.

To fix an earlier commit on your branch, use `git commit --fixup=<sha>` and then `git rebase --autosquash develop`. CI rejects leftover fixup commits.

## Definition of done

- CI is green.
- New behaviour has tests. Bug fixes include a test that fails without the fix.
- Schema changes include a migration, row-level security policies, pgTAP tests and regenerated types.
- No secrets in code. New settings are added to `.env.example` and `src/env.ts`.
- UI changes are checked in light and dark mode, and on a phone.
- `CHANGELOG.md` is updated under `Unreleased`.

## Local setup

Requirements: Node.js 22 (see `.nvmrc`), [pnpm](https://pnpm.io) 10 and Docker (give it at least 6 GB of memory).

```bash
pnpm install        # also installs the pre-commit hooks
pnpm db:start       # local Supabase + S3 storage in Docker (the first run downloads images)
pnpm dev            # http://localhost:3000
```

No `.env.local` is needed: every setting defaults to the local stack. Check it works with `curl localhost:3000/api/health`, which should report `"database": "ok"` and `"storage": "ok"`.

| Local service          | URL                                                                |
| ---------------------- | ------------------------------------------------------------------ |
| Supabase API           | http://127.0.0.1:55321                                             |
| Supabase Studio        | http://127.0.0.1:55323                                             |
| Mailpit (local emails) | http://127.0.0.1:55324                                             |
| Postgres               | `postgresql://postgres:postgres@127.0.0.1:55322/postgres`          |
| Storage (S3 API)       | http://localhost:9100                                              |
| Storage console        | http://localhost:9101 (`lockerly-local` / `lockerly-local-secret`) |

Local Supabase uses ports 553xx (not the default 543xx), so it can run next to other Supabase projects. `pnpm db:stop` stops everything.

> Never put staging or production keys in `.env.local`. Local commands would then act on real data.

## Checks

The same commands CI runs:

```bash
pnpm lint                      # ESLint (strict, type-aware), zero warnings allowed
pnpm format:check              # Prettier
pnpm typecheck                 # route types + tsc
pnpm test:coverage             # unit + integration tests; needs `pnpm db:start`
pnpm db:test                   # database and row-level security tests (pgTAP)
pnpm db:lint && pnpm db:advisors
pnpm build && pnpm test:e2e    # Playwright against the production build
```

- **Unit tests** (`tests/unit/`) need no services.
- **Integration tests** (`tests/integration/`) use the local stack.
- **Database tests** (`supabase/tests/`) run inside a transaction that is rolled back.
- Coverage below 85% fails the run, and so does any unexpected `console.error`.

## Database changes

```bash
pnpm exec supabase migration new <name> < /dev/null   # creates supabase/migrations/<timestamp>_<name>.sql
pnpm db:reset                                         # rebuild the local database from all migrations
pnpm db:test                                          # pgTAP
pnpm db:types                                         # regenerate src/server/db/database.types.ts
```

Rules:

1. Every schema change ships as a migration, with row-level security policies and pgTAP tests, in the same PR.
2. Never edit a migration that has reached `develop`. Add a new one.
3. Migrations must work with the version already running (add columns as nullable or with a default; remove things in a later release). Staging and production apply them while the old app is still serving.
4. Migrations that change data must be safe to run twice.
5. Privileged (`SECURITY DEFINER`) functions live in the `private` schema and set `search_path = ''`. The guard tests in `supabase/tests/00_guards.test.sql` enforce the basics.

## Code layout

| Path                   | Holds                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| `src/app/`             | Routes, layouts and pages only. Thin, no business logic              |
| `src/components/`      | UI components (`ui/` holds the shadcn/ui primitives)                 |
| `src/server/actions/`  | Server Actions: validate input, get the user, call a service         |
| `src/server/services/` | Use cases                                                            |
| `src/server/domain/`   | Pure rules with no I/O                                               |
| `src/server/db/`       | Supabase clients and generated database types                        |
| `src/server/storage/`  | The S3 client (Cloudflare R2, or RustFS locally)                     |
| `src/server/errors.ts` | `AppError` classes and the one error format                          |
| `src/env.ts`           | Validated settings. Add every new setting here and to `.env.example` |
| `supabase/`            | Config, migrations and pgTAP tests                                   |
| `tests/`, `e2e/`       | Vitest and Playwright tests                                          |

## Errors

Every error response has the same shape:

```json
{ "error": { "code": "not_found", "message": "File not found", "requestId": "…" } }
```

Throw an `AppError` subclass and wrap Route Handlers in `withErrorHandling`. Server Actions return `ActionResult<T>` instead of throwing. Unexpected errors are logged with the request ID and return a generic `500`, so internals never leak.
