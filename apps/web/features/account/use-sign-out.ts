"use client";
import { useCallback } from "react";
import { useLocale } from "next-intl";
import { authService } from "@/services/auth.service";
import { useSessionStore } from "@/stores/session-store";

/**
 * Deliberate sign-out: end this session on the server, then leave with a full
 * navigation so no private screen (or its cached data) survives, and so the
 * shell's auth redirect doesn't attach a returnTo to a choice the user made.
 */
export function useSignOut() {
  const locale = useLocale();
  return useCallback(
    async (alreadyEnded = false) => {
      if (!alreadyEnded) await authService.logout().catch(() => undefined);
      useSessionStore.getState().setUser(null);
      window.location.assign(`/${locale}/welcome`);
    },
    [locale],
  );
}
