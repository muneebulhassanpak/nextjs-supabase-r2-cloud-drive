"use client";

import { useEffect, useEffectEvent } from "react";

/** A key that isn't meant for something else: typing, a dialog (closing ones too), a menu, or the browser. */
function isFree(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.isContentEditable || target?.closest("input, textarea, select")) return false;
  return !document.querySelector("[role=dialog], [role=alertdialog], [role=menu]");
}

/** Runs `action` when `key` is pressed anywhere on the page, while `enabled`. */
export function useShortcut(key: string, action: () => void, enabled = true): void {
  const run = useEffectEvent(action);
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key || !isFree(event)) return;
      event.preventDefault();
      run();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [key, enabled]);
}
