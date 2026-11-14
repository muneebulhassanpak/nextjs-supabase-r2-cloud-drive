"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A header that stays at the top: see-through over the top of the page, then solid (background,
 * blur and border) as soon as anything scrolls under it, so its links stay readable.
 */
export function StickyHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return (
    <header
      data-scrolled={scrolled}
      className="sticky top-0 z-20 border-b border-transparent transition-[background-color,border-color,backdrop-filter] duration-200 data-[scrolled=true]:border-border data-[scrolled=true]:bg-background/90 data-[scrolled=true]:backdrop-blur-md"
    >
      {children}
    </header>
  );
}
