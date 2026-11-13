import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// On Vercel every setting that reaches real data must be set explicitly: a missing key must fail
// the deploy, not silently fall back to the local stack.
const onVercel = Boolean(process.env.VERCEL);

/**
 * Local defaults: the Supabase CLI's development URL and publishable key, and the RustFS container.
 * The secret key has no default (it bypasses row-level security); locally, read it from
 * `supabase status` only when something needs it.
 */
const LOCAL = {
  supabaseUrl: "http://127.0.0.1:55321",
  publishableKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
  storageEndpoint: "http://localhost:9100",
  storageBucket: "lockerly-local",
  storageAccessKeyId: "lockerly-local",
  storageSecretAccessKey: "lockerly-local-secret",
} as const;

/** Required on Vercel; falls back to the local stack everywhere else. */
const required = (schema: z.ZodType<string, string>, localDefault: string) =>
  onVercel ? schema : schema.default(localDefault);

/**
 * Every setting is validated at startup, so a bad config fails fast instead of at first use.
 * A fresh clone runs with no .env.local at all.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
      .default("info"),

    // Bypasses row-level security. Only src/server/db/admin.ts may read it. Required on Vercel.
    SUPABASE_SECRET_KEY: onVercel ? z.string().min(20) : z.string().min(20).optional(),

    // S3-compatible storage: Cloudflare R2 on Vercel, RustFS locally.
    STORAGE_ENDPOINT: required(z.url(), LOCAL.storageEndpoint),
    STORAGE_BUCKET: required(z.string().min(3), LOCAL.storageBucket),
    STORAGE_ACCESS_KEY_ID: required(z.string().min(1), LOCAL.storageAccessKeyId),
    STORAGE_SECRET_ACCESS_KEY: required(z.string().min(1), LOCAL.storageSecretAccessKey),

    // Vercel Cron sends it as a bearer token; cron routes reject anything else.
    CRON_SECRET: onVercel ? z.string().min(32) : z.string().min(32).optional(),

    // Set by Vercel on every deployment; shown by /api/health so you can tell which build is live.
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),

    // Transactional email (share notifications). Unset locally: emails are logged instead.
    RESEND_API_KEY: z.string().startsWith("re_").optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: required(z.url(), LOCAL.supabaseUrl),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(z.string().min(20), LOCAL.publishableKey),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  // Treat empty strings (e.g. `STORAGE_BUCKET=` in .env.local) as unset, so defaults apply.
  emptyStringAsUndefined: true,
});
