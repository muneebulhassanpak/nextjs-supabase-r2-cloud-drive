"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

import type { ComponentProps } from "react";

/** Light, dark or system theme, stored per browser. The class goes on `<html>`. */
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider attribute="class" defaultTheme="system" enableSystem {...props} />;
}
