import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/env";
import { responseHeaders, type Disposition } from "@/lib/files/rules";
import { logger } from "@/server/logger";

import { storage } from "./client";

// Signed links let the browser move bytes straight to and from storage, so files never pass
// through the app. Callers sign only after Postgres (as the signed-in person) has allowed it.

/** How long an upload link works. Long enough for 25 MB on a slow connection. */
export const UPLOAD_URL_TTL = 5 * 60;
/** How long a download link works: enough to start the download, too short to pass around. */
export const DOWNLOAD_URL_TTL = 60;

/**
 * A link that uploads exactly one object: the key, size and type are part of the signature, so the
 * browser can't send more bytes or another type than the database reserved space for.
 */
export async function signUpload(key: string, size: number, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: key,
    ContentLength: size,
    ContentType: contentType,
  });
  const url = await getSignedUrl(storage, command, {
    expiresIn: UPLOAD_URL_TTL,
    signableHeaders: new Set(["content-length", "content-type"]),
  });
  return { url, method: "PUT" as const, headers: { "content-type": contentType } };
}

/** A short-lived link to read one object, with headers chosen by the server, not the upload. */
export async function signDownload(
  key: string,
  file: { name: string; mimeType: string },
  disposition: Disposition,
): Promise<string> {
  const { contentType, contentDisposition } = responseHeaders(
    file.mimeType,
    file.name,
    disposition,
  );
  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: contentDisposition,
    ResponseCacheControl: "private, max-age=60",
  });
  return getSignedUrl(storage, command, { expiresIn: DOWNLOAD_URL_TTL });
}

/** What storage holds under a key, or null if nothing arrived. */
export async function headObject(
  key: string,
): Promise<{ size: number; contentType: string | undefined } | null> {
  try {
    const head = await storage.send(
      new HeadObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
    );
    return { size: head.ContentLength ?? 0, contentType: head.ContentType };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

/** Deletes objects (missing ones are fine). Returns the keys storage couldn't delete. */
export async function deleteObjects(keys: readonly string[]): Promise<string[]> {
  const failed: string[] = [];
  // S3 takes up to 1000 keys per request.
  for (let start = 0; start < keys.length; start += 1000) {
    const batch = keys.slice(start, start + 1000);
    const result = await storage.send(
      new DeleteObjectsCommand({
        Bucket: env.STORAGE_BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    for (const error of result.Errors ?? []) if (error.Key) failed.push(error.Key);
  }
  return failed;
}

/** Deletes objects, logging (not throwing) on failure: the daily cleanup removes any it missed. */
export async function removeQuietly(keys: readonly string[]): Promise<void> {
  try {
    const failed = await deleteObjects(keys);
    if (failed.length > 0)
      logger.warn({ keys: failed }, "storage kept objects it was asked to delete");
  } catch (error) {
    logger.warn({ err: error, keys }, "couldn't delete objects from storage");
  }
}

/**
 * A short-lived link to a profile picture. Pictures are checked to be PNG, JPEG, WebP or GIF when
 * they're saved (and the type is part of the upload signature), so they're shown as stored.
 */
export async function signAvatar(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.STORAGE_BUCKET,
    Key: key,
    ResponseContentDisposition: "inline",
    ResponseCacheControl: "private, max-age=300",
  });
  return getSignedUrl(storage, command, { expiresIn: DOWNLOAD_URL_TTL });
}

/** Object keys (optionally under `prefix`) last written before `before`, a page at a time. */
export async function* listObjectsBefore(before: Date, prefix?: string): AsyncGenerator<string[]> {
  let token: string | undefined;
  do {
    const page = await storage.send(
      new ListObjectsV2Command({
        Bucket: env.STORAGE_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (page.Contents ?? []).flatMap(({ Key, LastModified }) =>
      Key && LastModified && LastModified < before ? [Key] : [],
    );
    if (keys.length > 0) yield keys;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}
