"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { fileUrl, linkFileUrl, linkThumbnailSrc, markOpened, thumbnailSrc } from "@/lib/files/api";

/**
 * How the browser reaches a file's bytes: as the signed-in person (the default), or through a
 * public link, where the token stands in for an account. Previews and thumbnails ask this, so the
 * same components work in both places.
 */
export interface FileAccess {
  url: (id: string, disposition: "inline" | "attachment") => Promise<{ url: string }>;
  thumbnail: (id: string) => string;
  /** Counts an open, for Recents. Nothing to count for people on a public link. */
  opened: (id: string) => void;
}

const signedIn: FileAccess = {
  url: fileUrl,
  thumbnail: thumbnailSrc,
  opened: (id) => {
    void markOpened(id);
  },
};

const FileAccessContext = createContext<FileAccess>(signedIn);

export const useFileAccess = () => useContext(FileAccessContext);

/** Everything inside reaches files through the public link `token`. */
export function LinkFileAccess({ token, children }: { token: string; children: ReactNode }) {
  const access = useMemo<FileAccess>(
    () => ({
      url: (id, disposition) => linkFileUrl(token, id, disposition),
      thumbnail: (id) => linkThumbnailSrc(token, id),
      opened: () => undefined,
    }),
    [token],
  );
  return <FileAccessContext value={access}>{children}</FileAccessContext>;
}

/** Starts a download: storage sends the file as an attachment, so the page stays put. */
export async function downloadWith(access: FileAccess, id: string): Promise<void> {
  const { url } = await access.url(id, "attachment");
  window.location.assign(url);
}
