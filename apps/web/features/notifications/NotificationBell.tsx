"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { IconButton } from "@petlife/ui";
import { useNotificationBootstrap } from "@/hooks/use-notification-bootstrap";
import { useNotificationStore } from "@/stores/notification-store";

/** Header bell (spec: "bell/icon, unread badge") — links to the full notification center rather than a dropdown panel, keeping this component small and avoiding popover-positioning complexity for a first pass. */
export function NotificationBell() {
  useNotificationBootstrap();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("notifications");

  return (
    <div className="relative">
      <IconButton
        label={unreadCount > 0 ? t("bellLabelUnread", { count: unreadCount }) : t("bellLabel")}
        onClick={() => router.push(`/${locale}/notifications`)}
        icon={
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        }
      />
      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-state-urgent px-1 text-[10px] font-medium leading-none text-text-inverse"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </div>
  );
}
