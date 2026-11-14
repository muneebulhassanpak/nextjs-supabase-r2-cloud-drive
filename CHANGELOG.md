# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/releases/tag/v0.1.0
