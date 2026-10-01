"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyThemeToDocument, useThemeStore } from "@/stores/theme-store";

/**
 * Theme and language are independent. A language switch is a client navigation into the other
 * locale's layout, which re-renders <html> (lang/dir) and drops the data-theme attribute the
 * pre-paint script set on first load. Re-apply the stored theme after every navigation so the theme
 * a person chose survives any locale change.
 */
export function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);
  const pathname = usePathname();
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme, pathname]);
  return null;
}
