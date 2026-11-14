# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-11-14

### Added

- Preview files without downloading them: double-click a file (tap on a phone), or choose Preview from its menu. Step through the folder's files with ← and → or the arrow buttons; Esc closes.
- Images fit the screen and can be shown at actual size; PDFs open in the browser's viewer (phones that can't show them offer to open the PDF on its own); videos and audio play in the browser's own players.
- Text and code show with line numbers and syntax highlighting that follows the light or dark theme. Long files show their first 1 MB.
- Image thumbnails in grid view.
- A file kept open for a moment goes to the top of Recent (stepping past one with the arrow keys doesn't count).
- `pnpm seed:files` fills a local account with a file of every previewable type.

### Security

- HTML, SVG and XML files are shown only as their source text, never rendered, so their scripts can't run. Code is highlighted by building elements from tokens, never by inserting HTML.
- Links for playing audio and video and for reading PDFs last 30 minutes, so they keep working while people watch and scroll; every other link still lasts 60 seconds.

## [0.5.0] - 2026-11-14

### Added

- Upload files: pick them from New → File upload, or drop them anywhere on a folder. Three upload at a time, with progress, cancel and retry, and the uploads panel stays while you move between folders.
- Files go straight from the browser to storage, never through the app, so uploads up to 25 MB stay fast.
- A file with a name that's already taken is saved as "name (1).ext" instead of failing.
- Download any file you can see.
- Profile pictures (PNG, JPEG, WebP or GIF up to 2 MB), shown in the account menu.
- A daily clean-up that removes uploads abandoned for a day and stored files nothing points at.

### Changed

- "New folder" moved into a New menu, next to File upload.

### Security

- Upload links are signed for one file, of one exact size and type, for 5 minutes; storage refuses anything else. Download links last 60 seconds and are only signed after the database confirms you can see the file.
- The 25 MB limit and the 100 MB quota are enforced by the database when an upload starts, so parallel uploads can't squeeze past them. When an upload finishes, the app checks storage holds exactly the bytes that were reserved, and the database checks again that you can still add files to the folder and that it isn't in the trash.
- Files that could run script in a browser (HTML, SVG, XML) are always downloaded, never shown, and text is only ever shown as plain text.
- Profile pictures can only point inside the person's own picture folder, never at someone's files or at an outside address (the unused `avatar_url` column was removed).

## [0.4.0] - 2026-11-14

### Added

- Folders: create, rename and move folders to the trash, nested up to 50 levels deep, with breadcrumbs back to the top.
- Browse in a list or a grid. Your choice is remembered on every device; sorting (name, modified, size) is kept in the address bar, folders always first.
- Select items with a click, Ctrl/⌘ or Shift, or select everything with Ctrl/⌘+A. Keyboard shortcuts: F2 to rename, Delete to trash, Escape to clear.
- A right-click menu, a "more" menu on every item, and an action sheet on phones.
- A details panel showing type, owner, size and dates.
- Changes show up instantly and roll back with a message if the server refuses them.

### Security

- The app asks the database what you may do with an item (owner, editor or viewer), so the buttons it shows always match the access rules. Folders you can't see look exactly like folders that don't exist.

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
