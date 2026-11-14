"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches. False during server rendering and hydration, so use it only
 * for behaviour after the page is interactive, not for what is first drawn.
 */
export function useMediaQuery(query: string): boolean {
  // Stable per query, so React doesn't resubscribe on every render.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
