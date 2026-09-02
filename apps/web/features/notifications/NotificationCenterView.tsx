"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, IconButton, Skeleton, StatusLabel } from "@petlife/ui";
import type { NotificationDto } from "@petlife/types";
import { notificationsService } from "@/services/notifications.service";
import { useNotificationStore } from "@/stores/notification-store";

const PAGE_SIZE = 20;

const CATEGORY_TONE: Record<string, "neutral" | "success" | "urgent"> = {
  SECURITY: "urgent",
  PAYMENT: "neutral",
  BOOKING: "neutral",
  SERVICE: "neutral",
  HEALTH: "neutral",
  COMMERCE: "neutral",
  DELIVERY: "neutral",
  SELLER: "neutral",
  MARKETPLACE: "neutral",
  HOUSEHOLD: "neutral",
  PET_ACCESS: "neutral",
  SYSTEM: "neutral",
  MARKETING: "neutral",
};

function formatTimestamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * The notification center (spec: "what happened / what needs attention",
 * distinct from Home's "what matters now"). Restrained visual hierarchy per
 * spec: HIGH/URGENT priority gets a small left accent bar and bold title,
 * never a wall of red — only SECURITY gets an urgent-toned category badge.
 */
export function NotificationCenterView() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const locale = useLocale();
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const result = await notificationsService.list(1, PAGE_SIZE);
      setItems(result.items);
      setTotal(result.total);
      setPage(1);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await notificationsService.list(page + 1, PAGE_SIZE);
      setItems((prev) => [...(prev ?? []), ...result.items]);
      setTotal(result.total);
      setPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  }

  async function openNotification(notification: NotificationDto) {
    if (!notification.readAt) {
      setItems((prev) => prev?.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)) ?? prev);
      try {
        await notificationsService.markRead(notification.id);
        const { unreadCount } = await notificationsService.unreadCount();
        setUnreadCount(unreadCount);
      } catch {
        void load();
      }
    }
    if (notification.deepLink) router.push(`/${locale}${notification.deepLink}`);
  }

  async function markAllRead() {
    await notificationsService.markAllRead();
    setItems((prev) => prev?.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) ?? prev);
    setUnreadCount(0);
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!items) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {items.some((n) => !n.readAt) ? (
            <Button variant="ghost" onClick={markAllRead}>
              {t("markAllRead")}
            </Button>
          ) : null}
          <IconButton
            label={t("preferencesLink")}
            onClick={() => router.push(`/${locale}/notifications/preferences`)}
            icon={
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            }
          />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title={t("empty")} actionLabel={t("browseHome")} onAction={() => router.push(`/${locale}/home`)} />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((notification) => {
              const isUnread = !notification.readAt;
              const isHighPriority = notification.priority === "HIGH" || notification.priority === "URGENT";
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className={`w-full text-start ${isHighPriority ? "border-s-4 border-s-state-urgent ps-2" : ""}`}
                  >
                    <ContextSurface className={`flex flex-col gap-1 ${isUnread ? "bg-surface-elevated" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className={`text-body ${isUnread ? "font-semibold" : "font-medium"} text-text-primary`}>{notification.title}</p>
                        {isUnread ? <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-state-urgent" /> : null}
                      </div>
                      <p className="text-metadata text-text-secondary">{notification.body}</p>
                      <div className="flex items-center justify-between gap-3">
                        <StatusLabel tone={CATEGORY_TONE[notification.category] ?? "neutral"}>{t(`category.${notification.category}`)}</StatusLabel>
                        <span className="text-metadata text-text-secondary">{formatTimestamp(notification.createdAt, locale)}</span>
                      </div>
                    </ContextSurface>
                  </button>
                </li>
              );
            })}
          </ul>

          {items.length < total ? (
            <Button variant="ghost" isLoading={loadingMore} onClick={loadMore}>
              {t("loadMore")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
