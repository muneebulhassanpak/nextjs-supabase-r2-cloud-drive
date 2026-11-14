/**
 * Puts a "Samples" folder with a file of every previewable type (fixtures/files) into a local
 * account, creating the account if needed. Uploads go the way the app's do: `start_upload` and
 * `complete_upload` as that person, so the database checks quota and access. Idempotent: files
 * already in the folder are skipped.
 *
 *   pnpm seed:files                       # ava@demo.dev / demo-pass-123
 *   SEED_EMAIL=… SEED_PASSWORD=… pnpm seed:files
 *
 * Local only: it reads the keys from `supabase status` and refuses any other database. Runs under
 * plain Node, so it can't import the app's modules; the storage defaults match `LOCAL` in src/env.ts.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/server/db/database.types.ts";

const LOCAL_API_URL = "http://127.0.0.1:55321";
const FIXTURES = join(import.meta.dirname, "..", "fixtures", "files");
const FOLDER = "Samples";
const email = process.env.SEED_EMAIL ?? "ava@demo.dev";
const password = process.env.SEED_PASSWORD ?? "demo-pass-123";

const TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".html": "text/html",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ts": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

function localKeys(): { publishable: string; secret: string } {
  const output = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const values = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line);
    if (match?.[1] && match[2] !== undefined) values.set(match[1], match[2]);
  }
  const value = (name: string) => values.get(name);
  if (value("API_URL") !== LOCAL_API_URL) {
    throw new Error(`Expected the local stack at ${LOCAL_API_URL}. Is it running (pnpm db:start)?`);
  }
  const publishable = value("PUBLISHABLE_KEY");
  const secret = value("SECRET_KEY");
  if (!publishable || !secret) throw new Error("supabase status has no keys.");
  return { publishable, secret };
}

const keys = localKeys();
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const storage = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT ?? "http://localhost:9100",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "lockerly-local",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "lockerly-local-secret",
  },
});
const bucket = process.env.STORAGE_BUCKET ?? "lockerly-local";

// The account: create it (confirmed) the first time.
const admin = createClient<Database>(LOCAL_API_URL, keys.secret, noSession);
const user = createClient<Database>(LOCAL_API_URL, keys.publishable, noSession);
let signIn = await user.auth.signInWithPassword({ email, password });
if (signIn.error) {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email === "ava@demo.dev" ? "Ava Demo" : email.split("@")[0] },
  });
  if (error) throw error;
  signIn = await user.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  console.warn(`Created ${email}`);
}

// The folder, at the top of My Drive.
let { data: folder } = await user
  .from("items")
  .select("id")
  .eq("kind", "folder")
  .eq("name", FOLDER)
  .is("parent_id", null)
  .is("trashed_at", null)
  .maybeSingle();
if (!folder) {
  const created = await user
    .from("items")
    .insert({ kind: "folder", name: FOLDER })
    .select("id")
    .single();
  if (created.error) throw created.error;
  folder = created.data;
}

const { data: existing, error: listError } = await user
  .from("items")
  .select("name")
  .eq("parent_id", folder.id)
  .is("trashed_at", null);
if (listError) throw listError;
const taken = new Set(existing.map((item) => item.name));

let added = 0;
for (const name of readdirSync(FIXTURES).sort()) {
  if (taken.has(name)) continue;
  const type = TYPES[extname(name)] ?? "application/octet-stream";
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- names listed from FIXTURES
  const bytes = readFileSync(join(FIXTURES, name));
  const started = await user
    .rpc("start_upload", {
      p_parent_id: folder.id,
      p_name: name,
      p_size: bytes.length,
      p_mime_type: type,
    })
    .single();
  if (started.error) throw started.error;
  await storage.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: started.data.object_key,
      Body: bytes,
      ContentType: type,
    }),
  );
  const { error } = await user.rpc("complete_upload", { p_item_id: started.data.id });
  if (error) throw error;
  added += 1;
}

console.warn(
  `${FOLDER}: ${String(added)} added, ${String(taken.size)} already there. Sign in as ${email}.`,
);
