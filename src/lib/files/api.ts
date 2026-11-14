// The browser's side of uploads and downloads: calls to the app's API, and the upload itself,
// which goes straight to storage through a signed link (never through the app).

/**
 * A failed step. `retryable` is false when trying again can't help (too big, no access). `status`
 * is the API's HTTP status, or undefined if no answer came back.
 */
export class TransferError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TransferError";
  }
}

const FINAL_STATUSES = new Set([401, 403, 404, 413, 422]);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new TransferError("You seem to be offline. Check your connection and try again.");
  }
  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  throw new TransferError(
    body?.error?.message ?? "Something went wrong. Try again.",
    !FINAL_STATUSES.has(response.status),
    response.status,
  );
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export interface SignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export const startUpload = (parentId: string | null, file: File) =>
  api<{ id: string; name: string; upload: SignedUpload }>(
    "/api/uploads",
    json({ parentId, name: file.name, size: file.size, type: file.type }),
  );

export const finishUpload = (id: string) =>
  api<{ id: string; name: string }>(`/api/uploads/${id}/complete`, { method: "POST" });

/** Gives up on an upload. Never throws: the daily cleanup removes anything this misses. */
export const cancelUpload = (id: string) =>
  api<undefined>(`/api/uploads/${id}`, { method: "DELETE" }).catch(() => undefined);

export const startAvatarUpload = (file: File) =>
  api<{ key: string; upload: SignedUpload }>(
    "/api/avatar",
    json({ size: file.size, type: file.type }),
  );

export const saveAvatar = (key: string) =>
  api<{ avatarKey: string }>("/api/avatar/complete", json({ key }));

export const removeAvatar = () => api<undefined>("/api/avatar", { method: "DELETE" });

export const fileUrl = (id: string, disposition: "inline" | "attachment") =>
  api<{ url: string }>(`/api/files/${id}/url?disposition=${disposition}`);

/**
 * Sends a file to storage with a signed link, reporting progress. XHR rather than fetch, because
 * fetch can't report upload progress.
 */
export function sendFile(
  upload: SignedUpload,
  file: File,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new TransferError("Storage didn't accept the file. Try again."));
    };
    xhr.onerror = () => {
      reject(new TransferError("The upload was interrupted. Check your connection and try again."));
    };
    xhr.onabort = () => {
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", () => {
      xhr.abort();
    });
    xhr.send(file);
  });
}

/** Starts a download: storage sends the file as an attachment, so the page stays put. */
export async function download(id: string): Promise<void> {
  const { url } = await fileUrl(id, "attachment");
  window.location.assign(url);
}
