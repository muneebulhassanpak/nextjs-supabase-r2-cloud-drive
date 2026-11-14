"use client";

import { useState } from "react";

import { Field } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { itemNameSchema } from "@/lib/drive/names";

/**
 * Asks for a name (new folder, rename). Checks the name rules and clashes with what's already in
 * the folder before closing; the database checks again.
 */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialName,
  renaming = false,
  hasExtension = false,
  takenNames,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initialName: string;
  /** Renaming an item called `initialName` (submitting it unchanged just closes). */
  renaming?: boolean;
  /** The name ends in a file extension, which typing shouldn't replace. */
  hasExtension?: boolean;
  /** Names already in the folder, lowercased. */
  takenNames: Set<string>;
  onSubmit: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <NameForm
            title={title}
            description={description}
            submitLabel={submitLabel}
            initialName={initialName}
            renaming={renaming}
            hasExtension={hasExtension}
            takenNames={takenNames}
            onSubmit={onSubmit}
            onCancel={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  title,
  description,
  submitLabel,
  initialName,
  renaming,
  hasExtension,
  takenNames,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  submitLabel: string;
  initialName: string;
  renaming: boolean;
  hasExtension: boolean;
  takenNames: Set<string>;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = itemNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    if (renaming && parsed.data === initialName) {
      onCancel();
      return;
    }
    // Changing only the case of its own name is fine; taking another item's name isn't.
    const key = parsed.data.toLowerCase();
    if (!(renaming && key === initialName.toLowerCase()) && takenNames.has(key)) {
      setError(`There's already something called “${parsed.data}” here.`);
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field
        label="Name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setError(undefined);
        }}
        onFocus={(event) => {
          // Select a file's name without its extension, so typing replaces just that.
          const dot = hasExtension ? event.target.value.lastIndexOf(".") : -1;
          event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
        }}
        autoFocus
        maxLength={255}
        autoComplete="off"
        errors={error ? [error] : undefined}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}
