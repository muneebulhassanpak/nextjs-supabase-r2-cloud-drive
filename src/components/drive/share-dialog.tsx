"use client";

import { Check, ChevronDown, Copy, Globe, Link2, Loader2, Lock } from "lucide-react";
import { useEffect, useState, useTransition, type SyntheticEvent } from "react";
import { toast } from "sonner";

import {
  changeShareRole,
  createShareLink,
  loadShareInfo,
  removeAccess,
  revokeShareLink,
  shareItem,
} from "@/app/drive/share-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/format";
import {
  LINK_EXPIRY_CHOICES,
  type AccessEntry,
  type LinkExpiry,
  type ShareInfo,
  type ShareRole,
} from "@/lib/sharing/types";

const ROLE_LABELS = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;
const ROLE_HELP = { editor: "Can add, rename, move and delete", viewer: "Can view and download" };
const EXPIRY_LABELS: Record<string, string> = {
  null: "Never expires",
  1: "Expires in 1 day",
  7: "Expires in 7 days",
  30: "Expires in 30 days",
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Emails typed or pasted together, split on commas, semicolons and spaces. */
function splitEmails(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Who has access to an item, and (for its owner) adding people, changing roles and the public
 * link. Everyone else sees the list read-only. The database decides every change.
 */
export function ShareDialog({
  item,
  currentUserId,
  onOpenChange,
}: {
  /** The item being shared; the dialog is open while there is one. */
  item: { id: string; name: string } | null;
  currentUserId: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        {item && <SharePanel key={item.id} item={item} currentUserId={currentUserId} />}
      </DialogContent>
    </Dialog>
  );
}

function SharePanel({
  item,
  currentUserId,
}: {
  item: { id: string; name: string };
  currentUserId: string;
}) {
  const [info, setInfo] = useState<ShareInfo>();
  const [error, setError] = useState<string>();
  // Bumped after every change, to load the list again.
  const [version, setVersion] = useState(0);
  const [, startLoading] = useTransition();
  const reload = () => {
    setVersion((current) => current + 1);
  };

  useEffect(() => {
    let current = true;
    startLoading(async () => {
      const result = await loadShareInfo(item.id);
      if (!current) return;
      if (result.ok) {
        setInfo(result.data);
        setError(undefined);
      } else setError(result.error.message);
    });
    return () => {
      current = false;
    };
  }, [item.id, version]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate pr-6">Share “{item.name}”</DialogTitle>
        <DialogDescription>
          {info && !info.canManage
            ? "Only the owner can change who has access."
            : "Add people by email, or make a link anyone can open."}
        </DialogDescription>
      </DialogHeader>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : !info ? (
        <div className="flex h-40 items-center justify-center" aria-label="Loading">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {info.canManage && <AddPeople itemId={item.id} onShared={reload} />}
          <PeopleList info={info} currentUserId={currentUserId} onChanged={reload} />
          {info.canManage && <PublicLink info={info} onChanged={reload} />}
        </>
      )}
    </>
  );
}

function AddPeople({ itemId, onShared }: { itemId: string; onShared: () => void }) {
  const [text, setText] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [error, setError] = useState<string>();
  const [sending, startSending] = useTransition();

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const emails = splitEmails(text);
    if (emails.length === 0) {
      setError("Add at least one email address.");
      return;
    }
    setError(undefined);
    startSending(async () => {
      const result = await shareItem(itemId, emails, role);
      if (result.ok) {
        setText("");
        const count = result.data.shared;
        toast.success(count === 1 ? "Shared" : `Shared with ${String(count)} people`);
        onShared();
      } else {
        setError(result.error.message);
        // Some may have gone before the one that was refused.
        if (result.error.message.startsWith("Shared with")) onShared();
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-2" noValidate>
      <label htmlFor="share-emails" className="text-sm font-medium">
        Add people
      </label>
      <div className="flex gap-2">
        <Input
          id="share-emails"
          inputSize="lg"
          type="text"
          inputMode="email"
          autoComplete="off"
          placeholder="Emails, separated by commas"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "share-error" : undefined}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <RolePicker role={role} onChange={setRole} label="Role for new people" />
      </div>
      {error && (
        <p id="share-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          They get an email. People without an account see it once they sign up.
        </p>
        <Button type="submit" disabled={sending || text.trim() === ""}>
          {sending && <Loader2 className="animate-spin" />}
          Share
        </Button>
      </div>
    </form>
  );
}

function RolePicker({
  role,
  onChange,
  label,
  onRemove,
}: {
  role: ShareRole;
  onChange: (role: ShareRole) => void;
  label: string;
  onRemove?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 shrink-0"
          aria-label={`${label}: ${ROLE_LABELS[role]}`}
        >
          {ROLE_LABELS[role]}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup
          value={role}
          onValueChange={(value) => {
            onChange(value as ShareRole);
          }}
        >
          {(["viewer", "editor"] as const).map((option) => (
            <DropdownMenuRadioItem key={option} value={option} className="items-start">
              <span className="grid">
                <span>{ROLE_LABELS[option]}</span>
                <span className="text-xs text-muted-foreground">{ROLE_HELP[option]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {onRemove && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              Remove access
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PeopleList({
  info,
  currentUserId,
  onChanged,
}: {
  info: ShareInfo;
  currentUserId: string;
  onChanged: () => void;
}) {
  const [, startChange] = useTransition();
  const target = (entry: AccessEntry) =>
    entry.kind === "invite" ? { email: entry.key } : { userId: entry.key };

  function setRole(entry: AccessEntry, role: ShareRole) {
    startChange(async () => {
      const result = await changeShareRole(info.item.id, target(entry), role);
      if (!result.ok) toast.error(result.error.message);
      onChanged();
    });
  }

  function remove(entry: AccessEntry) {
    startChange(async () => {
      const result = await removeAccess(info.item.id, target(entry));
      if (result.ok) toast.success(`Removed ${entry.person.name ?? entry.person.email ?? "them"}`);
      else toast.error(result.error.message);
      onChanged();
    });
  }

  return (
    <section aria-labelledby="share-people" className="grid gap-2">
      <h3 id="share-people" className="text-sm font-medium">
        People with access
      </h3>
      <ul className="-mx-2 grid max-h-64 gap-0.5 overflow-y-auto">
        {info.people.map((entry) => {
          const { person } = entry;
          const you = entry.kind !== "invite" && entry.key === currentUserId;
          const title = person.name ?? person.email ?? "Someone";
          const details = [
            person.name && person.email,
            entry.kind === "invite" && "Invited, no account yet",
            entry.from && `From “${entry.from.name}”`,
          ].filter(Boolean);
          // Only shares on this item can change here; ones from a folder above change there.
          const editable = info.canManage && entry.kind !== "owner" && entry.direct;
          return (
            <li
              key={`${entry.kind}:${entry.key}`}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5"
            >
              <Avatar className="size-8">
                {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
                <AvatarFallback className="text-xs">
                  {initials(person.name, person.email ?? "?")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {title}
                  {you && <span className="text-muted-foreground"> (you)</span>}
                </p>
                {details.length > 0 && (
                  <p className="truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
                )}
              </div>
              {editable && entry.role !== "owner" ? (
                <RolePicker
                  role={entry.role}
                  label={`Role for ${title}`}
                  onChange={(role) => {
                    if (role !== entry.role) setRole(entry, role);
                  }}
                  onRemove={() => {
                    remove(entry);
                  }}
                />
              ) : (
                <span className="px-3 text-sm text-muted-foreground">
                  {ROLE_LABELS[entry.role]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PublicLink({ info, onChanged }: { info: ShareInfo; onChanged: () => void }) {
  const [expiry, setExpiry] = useState<LinkExpiry>(7);
  // The new link's address. Only the hash is stored, so it can only be shown right after it's made.
  const [fresh, setFresh] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [busy, startBusy] = useTransition();
  const { link } = info;
  const expired =
    link?.expiresAt !== undefined &&
    link.expiresAt !== null &&
    new Date(link.expiresAt) <= new Date();

  function create() {
    startBusy(async () => {
      const result = await createShareLink(info.item.id, expiry);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setFresh(`${window.location.origin}/s/${result.data.token}`);
      setCopied(false);
      onChanged();
    });
  }

  function revoke() {
    startBusy(async () => {
      const result = await revokeShareLink(info.item.id);
      if (result.ok) {
        setFresh(undefined);
        toast.success("Link turned off. It no longer opens.");
      } else toast.error(result.error.message);
      onChanged();
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  const status = !link
    ? "Only people with access can open it."
    : expired
      ? "The public link has expired."
      : link.expiresAt
        ? `Anyone with the link can view. Expires ${dateFormat.format(new Date(link.expiresAt))}.`
        : "Anyone with the link can view. It never expires.";

  return (
    <section aria-labelledby="share-link" className="grid gap-3 rounded-xl border p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          {link && !expired ? <Globe className="size-4" /> : <Lock className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="share-link" className="text-sm font-medium">
            Public link
          </h3>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
      </div>

      {fresh && (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input
              readOnly
              value={fresh}
              aria-label="Public link"
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void copy(fresh);
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Copy it now: for safety, Lockerly keeps no copy of this link and can&apos;t show it
            again.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`New link: ${EXPIRY_LABELS[String(expiry)] ?? ""}`}
            >
              {EXPIRY_LABELS[String(expiry)]}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={String(expiry)}
              onValueChange={(value) => {
                setExpiry(value === "null" ? null : (Number(value) as LinkExpiry));
              }}
            >
              {LINK_EXPIRY_CHOICES.map((choice) => (
                <DropdownMenuRadioItem key={String(choice)} value={String(choice)}>
                  {EXPIRY_LABELS[String(choice)]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {link && (
          <Button variant="outline" size="sm" disabled={busy} onClick={revoke}>
            Turn off
          </Button>
        )}
        <Button size="sm" disabled={busy} onClick={create}>
          {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
          {link ? "Make a new link" : "Create link"}
        </Button>
      </div>
      {link && !fresh && (
        <p className="text-xs text-muted-foreground">
          A new link replaces this one: the old address stops working.
        </p>
      )}
    </section>
  );
}
