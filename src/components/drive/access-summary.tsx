"use client";

import { Globe, Lock, Users } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { loadShareInfo } from "@/app/drive/share-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/format";
import { accessLabel } from "@/lib/sharing/access-label";
import type { ShareInfo } from "@/lib/sharing/types";

const MAX_FACES = 4;
/** Stepping quickly through items only asks about the one it stops at. */
const SETTLE_MS = 150;

/** Who can open an item, in one line, with their faces. */
export function AccessSummary({
  itemId,
  currentUserId,
}: {
  itemId: string;
  currentUserId: string;
}) {
  const [info, setInfo] = useState<ShareInfo>();
  const [error, setError] = useState<string>();
  const [, startLoading] = useTransition();

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      startLoading(async () => {
        const result = await loadShareInfo(itemId);
        if (!current) return;
        if (result.ok) setInfo(result.data);
        else setError(result.error.message);
      });
    }, SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [itemId]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!info) return <Skeleton className="h-16 rounded-2xl" aria-label="Loading access" />;

  const { title, detail, isPublic } = accessLabel(info, currentUserId, new Date());
  const Icon = isPublic ? Globe : info.people.length > 1 ? Users : Lock;
  const extra = info.people.length - MAX_FACES;
  return (
    <section
      aria-label="Who has access"
      className="flex min-h-16 items-center gap-3 rounded-2xl bg-primary-subtle px-4 py-3 text-primary-subtle-foreground"
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="truncate text-xs">{detail}</p>
      </div>
      {info.people.length > 1 && (
        <div aria-hidden className="flex shrink-0 -space-x-1">
          {info.people.slice(0, MAX_FACES).map(({ key, person }) => (
            <Avatar key={key} className="ring-2 ring-primary-subtle">
              {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
              <AvatarFallback className="bg-card text-xs text-foreground">
                {initials(person.name, person.email ?? "?")}
              </AvatarFallback>
            </Avatar>
          ))}
          {extra > 0 && (
            <span className="z-10 grid size-8 place-items-center rounded-full bg-card text-xs font-medium text-foreground ring-2 ring-primary-subtle">
              +{extra}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
