import { Clock, Link2Off, Lock, Trash2, type LucideIcon } from "lucide-react";
import { Suspense } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/app/empty-state";
import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { LinkFile, LinkFolder } from "@/components/sharing/link-browser";
import type { DriveItem } from "@/lib/drive/types";
import { pgErrorCode } from "@/server/errors";
import {
  getLinkFolder,
  getLinkRoot,
  getLinkStatus,
  type LinkStatus,
} from "@/server/services/public-links";

import type { Metadata } from "next";

type Props = PageProps<"/s/[token]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const root = await getLinkRoot(token).catch(() => null);
  return { title: root?.name ?? "Shared link" };
}

const DEAD: Record<Exclude<LinkStatus, "ok">, { icon: LucideIcon; title: string; text: string }> = {
  expired: {
    icon: Clock,
    title: "This link has expired",
    text: "Ask the person who shared it for a new link.",
  },
  revoked: {
    icon: Lock,
    title: "This link was turned off",
    text: "The person who shared it stopped sharing it this way. Ask them for access.",
  },
  unavailable: {
    icon: Trash2,
    title: "This isn't available right now",
    text: "Its owner moved it to the trash. Ask them if you still need it.",
  },
  missing: {
    icon: Link2Off,
    title: "This link doesn't work",
    text: "Check that you have the whole link, or ask the person who sent it for a new one.",
  },
};

function DeadLink({ status }: { status: Exclude<LinkStatus, "ok"> }) {
  const { icon, title, text } = DEAD[status];
  return (
    <EmptyState icon={icon} title={title}>
      {text}
    </EmptyState>
  );
}

type View =
  | { kind: "dead"; status: Exclude<LinkStatus, "ok"> }
  | { kind: "busy" }
  | { kind: "file"; file: DriveItem }
  | { kind: "folder"; folderId: string; path: { id: string; name: string }[]; items: DriveItem[] };

/** What the link shows: the file, a folder inside it, or why it doesn't open. */
async function loadLink(token: string, wanted: string | undefined): Promise<View> {
  try {
    const root = await getLinkRoot(token);
    if (!root) {
      const { status } = await getLinkStatus(token);
      // "ok" with nothing to show: it changed in between. Saying it doesn't work is true now.
      return { kind: "dead", status: status === "ok" ? "missing" : status };
    }
    if (root.kind === "file") return { kind: "file", file: root };
    const folderId = wanted && z.uuid().safeParse(wanted).success ? wanted : root.id;
    const folder = await getLinkFolder(token, folderId);
    return folder ? { kind: "folder", folderId, ...folder } : { kind: "dead", status: "missing" };
  } catch (error) {
    if (pgErrorCode(error) === "LK429") return { kind: "busy" };
    throw error;
  }
}

async function SharedLink({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const view = await loadLink(token, typeof query.folder === "string" ? query.folder : undefined);
  switch (view.kind) {
    case "dead":
      return <DeadLink status={view.status} />;
    case "busy":
      return (
        <EmptyState icon={Clock} title="This link is busy">
          It has been opened a lot in the last few minutes. Try again shortly.
        </EmptyState>
      );
    case "file":
      return <LinkFile token={token} file={view.file} />;
    case "folder":
      return <LinkFolder key={view.folderId} token={token} path={view.path} items={view.items} />;
  }
}

export default function SharedLinkPage(props: Props) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <SharedLink {...props} />
    </Suspense>
  );
}
