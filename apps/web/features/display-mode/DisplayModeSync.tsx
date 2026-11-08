"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyDisplayModeToDocument, useDisplayModeStore } from "@/stores/display-mode-store";

/** Reapply the device-local preference when a locale or route transition recreates the document root. */
export function DisplayModeSync() {
  const simple = useDisplayModeStore((state) => state.simple);
  const pathname = usePathname();

  useEffect(() => {
    applyDisplayModeToDocument(simple);
  }, [simple, pathname]);

  return null;
}
