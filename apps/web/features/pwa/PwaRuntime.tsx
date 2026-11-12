"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { notePathname, registerServiceWorker } from "./pwa-runtime";

/** Mounted once in the locale layout: registers the service worker and tracks in-app navigation. Renders nothing. */
export function PwaRuntime() {
  const pathname = usePathname();
  useEffect(() => {
    registerServiceWorker();
  }, []);
  useEffect(() => {
    if (pathname) notePathname(pathname);
  }, [pathname]);
  return null;
}
