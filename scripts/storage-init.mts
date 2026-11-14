/**
 * Creates the local storage bucket and lets the local app send and read files from the browser
 * (idempotent). Runs after `docker compose up`.
 * Local only: R2 buckets for staging and production are set up with Wrangler (see storage/).
 *
 * The local defaults below must match `LOCAL` in src/env.ts and docker-compose.yml. This script
 * runs under plain Node, outside the app's module graph, so it can't import them.
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.STORAGE_ENDPOINT ?? "http://localhost:9100";
const bucket = process.env.STORAGE_BUCKET ?? "lockerly-local";

const s3 = new S3Client({
  endpoint,
  // R2 calls its region "auto" but also accepts "us-east-1", which local S3 servers require.
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "lockerly-local",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "lockerly-local-secret",
  },
});

async function bucketExists(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === "NotFound") return false;
    throw error;
  }
}

// The container needs a moment after start: retry connection errors for up to 30 seconds.
// On Node 22, a refused connection to `localhost` (::1 and 127.0.0.1) is an AggregateError with an
// empty message, so look at the error codes, including those of nested errors.
const CONNECTION_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE"]);
function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && CONNECTION_CODES.has(code)) return true;
  if (error instanceof AggregateError) return error.errors.some(isConnectionError);
  return /socket hang up/i.test(error.message) || isConnectionError(error.cause);
}

// The same rules as storage/r2-cors.*.json, for the dev server (3000) and the e2e server (3100).
const cors = new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: ["http://localhost:3000", "http://localhost:3100"],
        AllowedMethods: ["PUT", "GET"],
        AllowedHeaders: ["content-type"],
        MaxAgeSeconds: 3600,
      },
    ],
  },
});

for (let attempt = 1; ; attempt++) {
  try {
    if (!(await bucketExists())) await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    await s3.send(cors);
    console.warn(`Storage ready: ${endpoint}/${bucket}`);
    break;
  } catch (error) {
    if (attempt === 30 || !isConnectionError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
