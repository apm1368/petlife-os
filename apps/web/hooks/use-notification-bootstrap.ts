"use client";

import { useEffect } from "react";
import { notificationsService } from "@/services/notifications.service";
import { useNotificationStore } from "@/stores/notification-store";

const POLL_INTERVAL_MS = 30_000;

/**
 * Keeps the header bell's unread count fresh without a websocket (none
 * exists in this codebase yet) — a simple poll while the app shell is
 * mounted, refreshed immediately on mount and every 30s after. Failures are
 * swallowed: a stale/missing badge count is a cosmetic degradation, never
 * worth surfacing an error banner for.
 */
export function useNotificationBootstrap(): void {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { unreadCount } = await notificationsService.unreadCount();
        if (!cancelled) setUnreadCount(unreadCount);
      } catch {
        // Silently ignore — see doc comment above.
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
