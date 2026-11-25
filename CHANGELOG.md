# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- An Activity screen in the sidebar: everything that happened to your files, what's shared with you and your account, by day, with filters for what and who. Entries open what they're about.
- The log now covers deleting forever (the 30-day clean-up included), invites, stars, downloads, sign-ins, and name, picture and password changes. Stars, downloads and account entries are visible only to you.
- History outlives what it's about: after a delete, its owner still sees what happened.

### Changed

- Details open in a window in the middle of the screen (a sheet on phones) instead of a narrow panel on the right. It shows the picture itself, buttons for the common actions, and who has access; the arrow keys step through the items without closing it.
- Activity is a timeline with an icon for each kind of change.
- The README covers what the app does, how it works, its security model and how it's tested, with screenshots.

## [0.9.0] - 2026-11-18

### Added

- Search from the top bar: suggestions appear as you type (pick one with the arrow keys or the mouse), and Enter shows every result. Names that start with your words come first, and small typos are forgiven.
- The results page can be narrowed by type, owner (me, others) and when items changed (last 7 days, 30 days, 12 months, or a custom range). Filters live in the address, so a search can be bookmarked, shared or stepped back through.
- An Activity tab in the details panel shows who did what and when: uploads, renames, moves, trash, sharing and links. A folder's activity includes everything inside it. Times read "2 hours ago", with the exact time on hover, and older entries load on request.

### Changed

- Search, and the folder search in "Move to…", stay fast on large drives (under 100 ms with 10,000 items).

## [0.8.0] - 2026-11-18

### Added

- Share files and folders with people by email, as a Viewer or an Editor. People without an account are invited and see the item once they sign up with that address. Everyone it's newly shared with gets an email.
- The share dialog lists who has access, including access that comes from a folder above ("From “Projects”"). The owner can change roles or remove people; everyone else can see the list but not change it.
- The Shared with me page lists what others have shared with you. You can remove things from it.
- Public links: anyone with the link can view and download, signed in or not, with no expiry or one that ends after 1, 7 or 30 days. The link is shown once (only a fingerprint of it is stored); making a new one or turning it off stops the old one at once.
- Links that no longer open say why: expired, turned off, in the trash, or never valid.
- Limits on sharing (50 people an hour) and on making links (30 an hour), and a pause for a link opened more than 600 times in 10 minutes.

## [0.7.0] - 2026-11-14

### Added

- Move files and folders with "Move to…": browse to a folder or search for one by name. On a computer you can also drag items onto a folder in the list or onto a breadcrumb.
- Select several items and move, star or trash them together.
- Star anything you can see; starred items are marked in every list and gathered on the Starred page.
- The Recent page lists files you've opened, grouped into Today, This week and Earlier in your own time zone.
- The Trash page: restore items to the folder they came from (or to My Drive if that folder is gone, under a new name if the old one is taken), delete them forever, or empty the trash. Moving something to the trash can be undone from the message that confirms it.
- Deleting forever removes the stored files and gives the space back straight away.
- Items left in the trash for 30 days are deleted for good by a daily job.

### Fixed

- End-to-end tests wait for the first drive page after signing in long enough for a busy machine, instead of failing now and then.

## [0.6.2] - 2026-11-14

### Fixed

- Production served a stylesheet from another build because two built files ended up with the same short name. Lockerly's built files now get names of their own.

## [0.6.1] - 2026-11-14

### Added

- A new landing page: what Lockerly does, short clips recorded in the real app (upload, preview, organise) in the light or dark theme to match the page, the tech stack, and how files are kept private.
- `pnpm record:demos` re-records those clips from the local app (needs ffmpeg).

### Changed

- One design system across the site: violet theme, surfaces, a type scale, colours per file type and motion tokens. Sign-in, sign-up and the password pages use a new centred card and share the landing page's header.
- The password field can show what's been typed.
- Animations respect "reduce motion": the page stays still, and clips never start by themselves and can always be paused.

### Fixed

- Folder pages list folders first and then names in a fixed order, so the first page of a large folder is always the same.

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

[Unreleased]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/releases/tag/v0.1.0
