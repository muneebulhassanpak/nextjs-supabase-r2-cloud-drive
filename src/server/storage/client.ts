import "server-only";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { env } from "@/env";

/**
 * File bytes live in an S3-compatible bucket: Cloudflare R2 on Vercel, RustFS locally and in CI.
 * Only this module talks to storage, and only after Postgres has allowed the request.
 */
export const storage = new S3Client({
  endpoint: env.STORAGE_ENDPOINT,
  // R2 calls its region "auto" but also accepts "us-east-1", which local S3 servers require.
  region: "us-east-1",
  // Local servers serve buckets by path (`host/bucket/key`); R2 supports both styles.
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
  // Server calls are small metadata requests (file bytes go browser ↔ R2 directly), so fail
  // fast instead of the SDK's default retries with backoff.
  maxAttempts: 2,
  // Without this the SDK adds a CRC32 of an empty body to signed upload links, which no real upload
  // matches. Checksums are still sent where S3 requires one (DeleteObjects).
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  requestHandler: { connectionTimeout: 3_000, requestTimeout: 5_000 },
});

/** Throws if the bucket can't be reached with the configured key. */
export async function pingStorage(): Promise<void> {
  // Listing (not HeadBucket) because R2 keys are scoped to objects in one bucket.
  await storage.send(new ListObjectsV2Command({ Bucket: env.STORAGE_BUCKET, MaxKeys: 1 }));
}
