# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-14

### Added

- Accounts: sign up with email and password, confirm the email address, sign in, and reset a forgotten password. Emails are branded and sent through Resend.
- The app shell: a sidebar with My Drive, Shared with me, Recent, Starred, Trash and storage used, a top bar with the account menu, and a slide-in menu on phones.
- Settings: change your name, and sign out of every device at once.
- A home page with sign in and sign up.

### Security

- Pages in the app are only reachable when signed in, and the session is checked (not just read from the cookie) on every request.
- Sign-up and password reset give the same answer whether or not an email is registered, so they can't be used to find out who has an account.
- Links in emails work once and only lead to pages on Lockerly, never to another site.
- Passwords need at least 8 characters with letters and numbers, enforced by Supabase Auth as well as the forms.

## [0.2.0] - 2026-11-14

### Added

- The data model for files and folders, sharing (with people and by public link), stars, recents and an activity log.
- Access rules in the database itself: every table has row-level security, and the database checks who may see, change, move, share or delete each item, even if the app has a bug.
- A 100 MB storage quota per person and a 25 MB limit per file, enforced by the database, including when uploads race each other.
- More than 300 database tests covering who can do what (owner, editor, viewer, stranger, visitor), plus a check that removing or loosening any access rule makes a test fail.

### Security

- Build tools now use a patched `minimatch` (GHSA-g3hv-75wg-m249). The app itself never used it.

## [0.1.0] - 2026-11-13

### Added

- A home page with the Lockerly brand, and light, dark and system themes.
- `/api/health` reports whether the database and file storage are reachable.
- Three environments: local (Supabase CLI and RustFS in Docker), staging (`develop`) and production (`main`). Database changes reach staging and production automatically after review.
- Checks on every pull request: lint, types, unit and integration tests with coverage, database tests (pgTAP), a production build and browser tests on desktop and phone sizes.

[Unreleased]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/releases/tag/v0.1.0
