import "server-only";

// What the demo drives hold. Times count back from the reset, so the demo always looks recent.

export type DemoPerson = "alex" | "sam";

export interface DemoItem {
  /** Names the item in this file; its id comes from it, so links to it survive a reset. */
  key: string;
  owner: DemoPerson;
  /** The key of the folder it's in. */
  in?: string;
  name: string;
  /** A file's bytes, under fixtures/; folders have none. */
  file?: string;
  type?: string;
  hoursAgo: number;
  /** In the trash since. */
  trashedHoursAgo?: number;
}

const DAY = 24;

export const DEMO_ITEMS: readonly DemoItem[] = [
  { key: "projects", owner: "alex", name: "Projects", hoursAgo: 20 * DAY },
  {
    key: "redesign",
    owner: "alex",
    in: "projects",
    name: "Website redesign",
    hoursAgo: 20 * DAY - 1,
  },
  { key: "finance", owner: "alex", name: "Finance", hoursAgo: 18 * DAY },
  { key: "photos", owner: "alex", name: "Photos", hoursAgo: 15 * DAY },
  { key: "media", owner: "alex", name: "Media", hoursAgo: 9 * DAY },
  { key: "handbook-folder", owner: "sam", name: "Team handbook", hoursAgo: 12 * DAY },
  {
    key: "welcome",
    owner: "alex",
    name: "Welcome to Lockerly.md",
    file: "demo/welcome.md",
    type: "text/markdown",
    hoursAgo: 20 * DAY + 1,
  },
  {
    key: "kickoff",
    owner: "alex",
    in: "redesign",
    name: "Kickoff notes.md",
    file: "demo/kickoff-notes.md",
    type: "text/markdown",
    hoursAgo: 19 * DAY,
  },
  {
    key: "greeting",
    owner: "alex",
    in: "redesign",
    name: "greeting.ts",
    file: "files/greet.ts",
    type: "text/plain",
    hoursAgo: 6 * DAY,
  },
  {
    key: "logo",
    owner: "alex",
    in: "redesign",
    name: "Logo.svg",
    file: "files/logo.svg",
    type: "image/svg+xml",
    hoursAgo: 17 * DAY,
  },
  {
    key: "feedback",
    owner: "sam",
    in: "redesign",
    name: "Design feedback.txt",
    file: "demo/design-feedback.txt",
    type: "text/plain",
    hoursAgo: 3 * DAY,
  },
  {
    key: "roadmap",
    owner: "alex",
    in: "projects",
    name: "Roadmap.txt",
    file: "demo/roadmap.txt",
    type: "text/plain",
    hoursAgo: 14 * DAY,
  },
  {
    key: "checklist",
    owner: "alex",
    in: "projects",
    name: "Release checklist.md",
    file: "demo/release-checklist.md",
    type: "text/markdown",
    hoursAgo: 2 * DAY,
  },
  {
    key: "budget",
    owner: "alex",
    in: "finance",
    name: "Budget 2026.csv",
    file: "demo/budget-2026.csv",
    type: "text/csv",
    hoursAgo: 11 * DAY,
  },
  {
    key: "people",
    owner: "alex",
    in: "finance",
    name: "Suppliers.csv",
    file: "files/people.csv",
    type: "text/csv",
    hoursAgo: 10 * DAY,
  },
  {
    key: "contract",
    owner: "alex",
    in: "finance",
    name: "Service agreement.pdf",
    file: "files/handbook.pdf",
    type: "application/pdf",
    hoursAgo: 8 * DAY,
  },
  {
    key: "archive",
    owner: "alex",
    in: "finance",
    name: "Receipts 2025.zip",
    file: "files/archive.zip",
    type: "application/zip",
    hoursAgo: 8 * DAY - 1,
  },
  {
    key: "mountains",
    owner: "alex",
    in: "photos",
    name: "Mountains.jpg",
    file: "files/mountains.jpg",
    type: "image/jpeg",
    hoursAgo: 15 * DAY - 1,
  },
  {
    key: "sunset",
    owner: "alex",
    in: "photos",
    name: "Sunset.png",
    file: "files/sunset.png",
    type: "image/png",
    hoursAgo: 15 * DAY - 1,
  },
  {
    key: "meadow",
    owner: "alex",
    in: "photos",
    name: "Meadow.webp",
    file: "files/meadow.webp",
    type: "image/webp",
    hoursAgo: 15 * DAY - 2,
  },
  {
    key: "clip",
    owner: "alex",
    in: "media",
    name: "Product teaser.webm",
    file: "files/clip.webm",
    type: "video/webm",
    hoursAgo: 9 * DAY - 1,
  },
  {
    key: "tone",
    owner: "alex",
    in: "media",
    name: "Intro sound.wav",
    file: "files/tone.wav",
    type: "audio/wav",
    hoursAgo: 9 * DAY - 2,
  },
  {
    key: "settings",
    owner: "alex",
    in: "media",
    name: "Export settings.json",
    file: "files/settings.json",
    type: "application/json",
    hoursAgo: 5 * DAY,
  },
  {
    key: "draft",
    owner: "alex",
    name: "Old draft.txt",
    file: "demo/draft.txt",
    type: "text/plain",
    hoursAgo: 16 * DAY,
    trashedHoursAgo: 4 * DAY,
  },
  {
    key: "handbook",
    owner: "sam",
    in: "handbook-folder",
    name: "Employee handbook.pdf",
    file: "files/handbook.pdf",
    type: "application/pdf",
    hoursAgo: 12 * DAY - 1,
  },
  {
    key: "holidays",
    owner: "sam",
    in: "handbook-folder",
    name: "Holidays 2026.txt",
    file: "demo/holidays-2026.txt",
    type: "text/plain",
    hoursAgo: 12 * DAY - 2,
  },
];

export const DEMO_SHARES: readonly {
  item: string;
  with: DemoPerson;
  role: "viewer" | "editor";
  hoursAgo: number;
}[] = [
  { item: "projects", with: "sam", role: "editor", hoursAgo: 19 * DAY - 1 },
  { item: "handbook-folder", with: "alex", role: "viewer", hoursAgo: 12 * DAY - 3 },
];

export const DEMO_STARS: readonly { item: string; by: DemoPerson; hoursAgo: number }[] = [
  { item: "projects", by: "alex", hoursAgo: 7 * DAY },
  { item: "budget", by: "alex", hoursAgo: 6 * DAY },
];

/** What happened besides things being added (that's worked out from the items). */
export const DEMO_EVENTS: readonly {
  item: string;
  by: DemoPerson;
  action: "renamed" | "moved" | "trashed" | "shared" | "starred" | "downloaded";
  hoursAgo: number;
  details?: Record<string, string | null>;
  /** Whose account `details.user_id` is, and which folders `details.from` and `to` are. */
  person?: DemoPerson;
  from?: string | null;
  to?: string | null;
}[] = [
  {
    item: "projects",
    by: "alex",
    action: "shared",
    hoursAgo: 19 * DAY - 1,
    person: "sam",
    details: { role: "editor" },
  },
  {
    item: "kickoff",
    by: "alex",
    action: "renamed",
    hoursAgo: 18 * DAY,
    details: { from: "notes.md", to: "Kickoff notes.md" },
  },
  { item: "roadmap", by: "alex", action: "moved", hoursAgo: 13 * DAY, from: null, to: "projects" },
  {
    item: "handbook-folder",
    by: "sam",
    action: "shared",
    hoursAgo: 12 * DAY - 3,
    person: "alex",
    details: { role: "viewer" },
  },
  { item: "projects", by: "alex", action: "starred", hoursAgo: 7 * DAY },
  { item: "budget", by: "alex", action: "starred", hoursAgo: 6 * DAY },
  { item: "draft", by: "alex", action: "trashed", hoursAgo: 4 * DAY },
  {
    item: "checklist",
    by: "sam",
    action: "renamed",
    hoursAgo: DAY + 3,
    details: { from: "Checklist.md", to: "Release checklist.md" },
  },
  { item: "handbook", by: "alex", action: "downloaded", hoursAgo: 5 },
];
