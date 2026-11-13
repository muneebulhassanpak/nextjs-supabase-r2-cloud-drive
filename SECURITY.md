# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately through GitHub's [private vulnerability reporting](https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/security/advisories/new). Include steps to reproduce and the impact you expect.

You'll get a reply within 3 working days. Once a fix is released, the report is credited in the changelog unless you'd rather stay anonymous.

## Supported versions

Only the latest release on `main` receives security fixes.

## How access is enforced

- **Postgres decides who sees what.** Every table has row-level security, and requests made for a user run with that user's own token, so a bug in application code can't hand over someone else's data.
- **The secret key is rare.** The Supabase secret key bypasses row-level security. Only `src/server/db/admin.ts` may use it (CI checks this), and only for scheduled jobs.
- **Files are never public.** Uploads and downloads use short-lived signed URLs, issued only after the database has confirmed the request is allowed.
- **Tests prove it.** Database tests (pgTAP) check every table and function on every pull request.
