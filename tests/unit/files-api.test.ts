import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelUpload,
  fileUrl,
  finishUpload,
  removeAvatar,
  saveAvatar,
  startAvatarUpload,
  startUpload,
  TransferError,
} from "@/lib/files/api";

// The browser's calls to the upload API: what it sends, and how failures become messages.

const respond = (status: number, body?: unknown) =>
  vi.fn(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

const file = new File(["hello"], "notes.txt", { type: "text/plain" });

describe("upload API calls", () => {
  it("sends the file's name, size and type as JSON, and returns the answer", async () => {
    const fetch = respond(201, { id: "1", name: "notes.txt", upload: { url: "u" } });
    vi.stubGlobal("fetch", fetch);
    await expect(startUpload("folder", file)).resolves.toMatchObject({ id: "1" });
    expect(fetch).toHaveBeenCalledWith("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: "folder", name: "notes.txt", size: 5, type: "text/plain" }),
    });
  });

  it("turns the API's error into a message, and says whether retrying can help", async () => {
    vi.stubGlobal("fetch", respond(413, { error: { message: "Not enough storage space left" } }));
    const final = await finishUpload("1").catch((error: unknown) => error);
    expect(final).toBeInstanceOf(TransferError);
    expect(final).toMatchObject({
      message: "Not enough storage space left",
      retryable: false,
      status: 413,
    });

    vi.stubGlobal("fetch", respond(500, { error: { message: "Something went wrong." } }));
    await expect(fileUrl("1", "inline")).rejects.toMatchObject({ retryable: true });
  });

  it("explains a lost connection, and copes with an answer that isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(saveAvatar("k")).rejects.toMatchObject({
      message: expect.stringMatching(/offline/) as string,
      status: undefined,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("<html>", { status: 502 }))),
    );
    await expect(startAvatarUpload(file)).rejects.toThrow("Something went wrong. Try again.");
  });

  it("treats an empty answer as success, and never throws when cancelling", async () => {
    vi.stubGlobal("fetch", respond(204));
    await expect(removeAvatar()).resolves.toBeUndefined();
    vi.stubGlobal("fetch", respond(404, { error: { message: "Upload not found." } }));
    await expect(cancelUpload("1")).resolves.toBeUndefined();
  });
});
