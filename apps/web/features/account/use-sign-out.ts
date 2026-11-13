"use client";
import { useCallback } from "react";
import { useLocale } from "next-intl";
import { authService } from "@/services/auth.service";
import { useSessionStore } from "@/stores/session-store";
import { detachPushOnSignOut } from "@/features/pwa/push-client";

/**
 * Deliberate sign-out: end this session on the server, then leave with a full
 * navigation so no private screen (or its cached data) survives, and so the
 * shell's auth redirect doesn't attach a returnTo to a choice the user made.
 * This browser's push subscription is removed first, while the session can still
 * prove it, so the next person on the device never gets this member's notifications.
 */
export function useSignOut() {
  const locale = useLocale();
  return useCallback(
    async (alreadyEnded = false) => {
      if (!alreadyEnded) await detachPushOnSignOut();
      if (!alreadyEnded) await authService.logout().catch(() => undefined);
      useSessionStore.getState().setUser(null);
      window.location.assign(`/${locale}/welcome`);
    },
    [locale],
  );
}
