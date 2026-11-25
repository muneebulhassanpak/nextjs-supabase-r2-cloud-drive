"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useShortcut } from "@/components/use-shortcut";

const SHORTCUTS = [
  { keys: ["/"], does: "Search" },
  { keys: ["N"], does: "New folder" },
  { keys: ["Enter"], does: "Open what's selected" },
  { keys: ["F2"], does: "Rename" },
  { keys: ["Delete"], does: "Move to the trash" },
  { keys: ["←", "→"], does: "Previous or next, in a preview or details" },
  { keys: ["?"], does: "This list" },
];

/** The list of keyboard shortcuts, opened with `?`. */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useShortcut("?", () => {
    setOpen(true);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            They work anywhere in your drive, except while typing.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-1 text-sm">
          {SHORTCUTS.map(({ keys, does }) => (
            <div key={does} className="flex items-center justify-between gap-4 py-1.5">
              <dt className="order-2 flex gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="min-w-7 rounded-md border bg-muted px-2 py-0.5 text-center text-xs font-medium"
                  >
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd className="text-muted-foreground">{does}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
