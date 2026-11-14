"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { cancelUpload, finishUpload, sendFile, startUpload, TransferError } from "@/lib/files/api";
import { MAX_FILE_SIZE } from "@/lib/files/rules";

import { UploadPanel } from "./upload-panel";

/** Files sent at the same time; the rest wait their turn. */
const PARALLEL_UPLOADS = 3;

export type UploadStatus = "queued" | "uploading" | "done" | "failed" | "cancelled";

export interface Upload {
  key: string;
  file: File;
  parentId: string | null;
  /** Where it's going, for the panel ("My Drive", a folder's name). */
  destination: string;
  /** The name it was saved under, once known ("report (1).pdf" if "report.pdf" was taken). */
  savedAs: string | null;
  status: UploadStatus;
  /** The bytes are in storage and the app is saving the file: too late to cancel. */
  saving: boolean;
  /**
   * Set when saving failed without a clear answer: the file may be saved already. Retrying asks
   * to finish this upload again rather than sending a second copy.
   */
  resumeId: string | null;
  loaded: number;
  error: string | null;
  retryable: boolean;
}

type Action =
  | { type: "add"; uploads: Upload[] }
  | { type: "update"; key: string; patch: Partial<Upload> }
  | { type: "retry"; key: string }
  | { type: "clear" };

function reducer(uploads: Upload[], action: Action): Upload[] {
  switch (action.type) {
    case "add":
      return [...uploads, ...action.uploads];
    case "update":
      return uploads.map((u) => (u.key === action.key ? { ...u, ...action.patch } : u));
    case "retry":
      return uploads.map((u) =>
        u.key === action.key ? { ...u, status: "queued", saving: false, error: null } : u,
      );
    case "clear":
      return uploads.filter((u) => u.status === "queued" || u.status === "uploading");
  }
}

interface UploadContext {
  uploads: Upload[];
  add: (files: Iterable<File>, parentId: string | null, destination: string) => void;
  cancel: (key: string) => void;
  retry: (key: string) => void;
  clear: () => void;
}

const Context = createContext<UploadContext | null>(null);

export function useUploads(): UploadContext {
  const context = useContext(Context);
  if (!context) throw new Error("useUploads needs an <UploadProvider> above it");
  return context;
}

/**
 * Runs uploads for the whole app, so they carry on while people move between folders. Each file:
 * reserve space and get a signed link, send the bytes straight to storage, then confirm.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [uploads, dispatch] = useReducer(reducer, []);
  const controllers = useRef(new Map<string, AbortController>());
  // Uploads being saved: cancelling now would leave a saved file the panel calls cancelled.
  const finishing = useRef(new Set<string>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // New files show up in their folder (and in the storage meter) once a batch settles.
  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      router.refresh();
    }, 400);
  }, [router]);

  const run = useCallback(
    async (upload: Upload) => {
      const { key, file } = upload;
      const update = (patch: Partial<Upload>) => {
        dispatch({ type: "update", key, patch });
      };
      const controller = new AbortController();
      controllers.current.set(key, controller);
      let serverId: string | null = null;
      let saving = false;
      try {
        if (file.size > MAX_FILE_SIZE) {
          throw new TransferError("Files can be at most 25 MB.", false);
        }
        let finished: { name: string } | null = null;
        if (upload.resumeId) {
          serverId = upload.resumeId;
          saving = true;
          update({ saving: true, loaded: file.size });
          finished = await finishUpload(upload.resumeId).catch((error: unknown) => {
            // The app gave that upload up (and said so): send the file again from the start.
            if (error instanceof TransferError && error.status !== undefined && !error.retryable)
              return null;
            throw error;
          });
        }
        if (!finished) {
          saving = false;
          update({ saving: false, loaded: 0, resumeId: null });
          const started = await startUpload(upload.parentId, file);
          serverId = started.id;
          if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
          await sendFile(
            started.upload,
            file,
            (loaded) => {
              update({ loaded });
            },
            controller.signal,
          );
          // Cancelled just as the last bytes landed: still in time.
          controller.signal.throwIfAborted();
          saving = true;
          finishing.current.add(key);
          update({ saving: true, loaded: file.size });
          finished = await finishUpload(started.id);
        }
        update({ status: "done", saving: false, resumeId: null, savedAs: finished.name });
        refreshSoon();
      } catch (error) {
        const known = error instanceof TransferError;
        // No answer while saving: the file may be saved, so keep the upload to finish on retry.
        const unsure = saving && known && error.status === undefined;
        // Otherwise free the reserved space now rather than waiting for the daily cleanup.
        if (serverId && !unsure) void cancelUpload(serverId);
        if (error instanceof DOMException && error.name === "AbortError") {
          update({ status: "cancelled", saving: false });
        } else {
          update({
            status: "failed",
            saving: false,
            resumeId: unsure ? serverId : null,
            error: known ? error.message : "Something went wrong. Try again.",
            retryable: known ? error.retryable : true,
          });
        }
        refreshSoon();
      } finally {
        controllers.current.delete(key);
        finishing.current.delete(key);
      }
    },
    [refreshSoon],
  );

  // Start queued files while fewer than PARALLEL_UPLOADS are going.
  useEffect(() => {
    const active = uploads.filter((u) => u.status === "uploading").length;
    const next = uploads.filter((u) => u.status === "queued").slice(0, PARALLEL_UPLOADS - active);
    for (const upload of next) {
      // Effects can run twice for one render (Strict Mode): never start a file twice.
      if (controllers.current.has(upload.key)) continue;
      dispatch({ type: "update", key: upload.key, patch: { status: "uploading" } });
      void run(upload);
    }
  }, [uploads, run]);

  // Leaving the page would drop uploads in progress: ask first.
  const busy = uploads.some((u) => u.status === "queued" || u.status === "uploading");
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [busy]);

  const value = useMemo<UploadContext>(
    () => ({
      uploads,
      add: (files, parentId, destination) => {
        const added = Array.from(files, (file) => ({
          key: crypto.randomUUID(),
          file,
          parentId,
          destination,
          savedAs: null,
          status: "queued" as const,
          saving: false,
          resumeId: null,
          loaded: 0,
          error: null,
          retryable: true,
        }));
        if (added.length > 0) dispatch({ type: "add", uploads: added });
      },
      cancel: (key) => {
        if (finishing.current.has(key)) return;
        const controller = controllers.current.get(key);
        if (controller) controller.abort();
        else dispatch({ type: "update", key, patch: { status: "cancelled" } });
      },
      retry: (key) => {
        dispatch({ type: "retry", key });
      },
      clear: () => {
        // Uploads left unsure are given up for good: free their space.
        for (const upload of uploads) if (upload.resumeId) void cancelUpload(upload.resumeId);
        dispatch({ type: "clear" });
      },
    }),
    [uploads],
  );

  return (
    <Context value={value}>
      {children}
      <UploadPanel />
    </Context>
  );
}
