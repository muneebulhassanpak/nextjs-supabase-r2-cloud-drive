# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-13

### Added

- A home page with the Lockerly brand, and light, dark and system themes.
- `/api/health` reports whether the database and file storage are reachable.
- Three environments: local (Supabase CLI and RustFS in Docker), staging (`develop`) and production (`main`). Database changes reach staging and production automatically after review.
- Checks on every pull request: lint, types, unit and integration tests with coverage, database tests (pgTAP), a production build and browser tests on desktop and phone sizes.
