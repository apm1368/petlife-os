"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
const Origin = createContext<string | null>(null);
const authPath = /^\/(fa|en)\/(auth|welcome|register|account)(\/|$)/;

/** Capture the actual originating URL before Next intercepts the auth link. */
export function AuthModalOrigin({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<string | null>(null);
  return <Origin.Provider value={origin}><div onClickCapture={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const anchor = (event.target as Element).closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !authPath.test(url.pathname) || authPath.test(window.location.pathname)) return;
    setOrigin(sanitizeReturnTo(window.location.pathname + window.location.search + window.location.hash, "/"));
  }}>{children}</div></Origin.Provider>;
}
export function useAuthModalOrigin() { return useContext(Origin); }
