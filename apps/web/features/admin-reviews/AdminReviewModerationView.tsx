"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminReviewModerationRowDto,
  AdminReviewModerationStatus,
  AdminReviewVertical,
} from "@petlife/types";
import { Button, Dialog, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatDay } from "@/lib/date/jalali";
import { adminReviewModerationService } from "@/services/admin-review-moderation.service";
import { useAdminStore } from "@/stores/admin-store";
import { FilterBar, FilterField, Panel, SelectFilter, Tag, TextFilter } from "../admin/console-ui";

type Decision = { row: AdminReviewModerationRowDto; kind: "APPROVED" | "REJECTED" };
const VERTICALS: AdminReviewVertical[] = ["SERVICE", "PRODUCT", "TRAVEL"];
const STATUSES: AdminReviewModerationStatus[] = ["PENDING", "APPROVED", "REJECTED", "PUBLISHED", "HIDDEN"];
const PERMISSION = { SERVICE: "services", PRODUCT: "commerce", TRAVEL: "travel" } as const;
const PATH = { SERVICE: "services/reviews", PRODUCT: "commerce/reviews", TRAVEL: "travel/reviews" } as const;

function copy(fa: boolean) {
  return {
    title: fa ? "مدیریت و تأیید نظرها" : "Review moderation",
    subtitle: fa
      ? "نظرهای تازه تا زمان تأیید در سایت عمومی و میانگین امتیاز دیده نمی‌شوند."
      : "New reviews stay out of public pages and rating averages until approved.",
    vertical: {
      SERVICE: fa ? "خدمات" : "Services",
      PRODUCT: fa ? "محصولات" : "Products",
      TRAVEL: fa ? "سفر و اقامت" : "Travel & stays",
    },
    status: {
      PENDING: fa ? "در انتظار" : "Pending",
      APPROVED: fa ? "تأییدشده" : "Approved",
      REJECTED: fa ? "ردشده" : "Rejected",
      PUBLISHED: fa ? "منتشرشدهٔ قدیمی" : "Legacy published",
      HIDDEN: fa ? "پنهان‌شده" : "Hidden",
    },
  };
}

export function AdminReviewModerationView({ initialVertical }: { initialVertical: AdminReviewVertical }) {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const text = copy(fa);
  const context = useAdminStore((state) => state.context);
  const adminStatus = useAdminStore((state) => state.status);
  const allowed = useMemo(
    () =>
      new Set(
        VERTICALS.filter((vertical) =>
          context?.permissions.includes(`${PERMISSION[vertical]}.view` as never),
        ),
      ),
    [context],
  );
  const canManage = context?.permissions.includes(`${PERMISSION[initialVertical]}.manage` as never) === true;
  const [status, setStatus] = useState<AdminReviewModerationStatus>("PENDING");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminReviewModerationService.list>> | null>(
    null,
  );
  const [error, setError] = useState<"forbidden" | "load" | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [labels, setLabels] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!allowed.has(initialVertical)) return;
      setError(null);
      try {
        const result = await adminReviewModerationService.list(
          { vertical: initialVertical, status, q: q.trim() || undefined, page },
          signal,
        );
        setData(result);
      } catch (cause) {
        if (signal?.aborted) return;
        setError(cause instanceof ApiError && cause.status === 403 ? "forbidden" : "load");
      }
    },
    [allowed, initialVertical, page, q, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const openDecision = (row: AdminReviewModerationRowDto, kind: Decision["kind"]) => {
    setDecision({ row, kind });
    setReason(row.moderationReason ?? "");
    setLabels(row.labels.join(", "));
    setActionError(null);
  };

  const submit = async () => {
    if (!decision || !canManage) return;
    const cleanLabels = labels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .slice(0, 10);
    const cleanReason = reason.trim();
    setBusy(true);
    setActionError(null);
    try {
      if (decision.kind === "APPROVED")
        await adminReviewModerationService.approve(initialVertical, decision.row.id, {
          reason: cleanReason || undefined,
          labels: cleanLabels,
        });
      else
        await adminReviewModerationService.reject(initialVertical, decision.row.id, {
          reason: cleanReason,
          labels: cleanLabels,
        });
      setDecision(null);
      await load();
    } catch (cause) {
      setActionError(
        cause instanceof ApiError && cause.status === 403
          ? fa
            ? "مجوز اقدام روی این حوزه یا رکورد را ندارید."
            : "You cannot act on this vertical or record."
          : fa
            ? "اقدام انجام نشد؛ دوباره تلاش کنید."
            : "The action failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (adminStatus === "idle" || adminStatus === "loading") return <Skeleton className="h-64" />;
  if (!allowed.has(initialVertical) || error === "forbidden")
    return (
      <EmptyState
        title={fa ? "دسترسی مشاهدهٔ نظرهای این حوزه را ندارید" : "You cannot view reviews in this vertical"}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-page-title">{text.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-text-secondary">{text.subtitle}</p>
      </header>
      <nav
        aria-label={fa ? "حوزهٔ نظرها" : "Review vertical"}
        className="flex gap-1 overflow-x-auto border-b border-border-subtle"
      >
        {VERTICALS.filter((vertical) => allowed.has(vertical)).map((vertical) => (
          <Link
            key={vertical}
            href={`/${locale}/admin/${PATH[vertical]}`}
            aria-current={vertical === initialVertical ? "page" : undefined}
            className={`whitespace-nowrap px-4 py-2 text-sm ${vertical === initialVertical ? "border-b-2 border-brand-natural font-bold text-text-primary" : "text-text-secondary"}`}
          >
            {text.vertical[vertical]}
          </Link>
        ))}
      </nav>
      <Panel>
        <FilterBar>
          <FilterField label={fa ? "جست‌وجوی متن، نویسنده یا مقصد" : "Search text, author or target"}>
            <TextFilter
              value={q}
              onChange={(value) => {
                setQ(value);
                setPage(1);
              }}
            />
          </FilterField>
          <FilterField label={fa ? "وضعیت" : "Status"}>
            <SelectFilter
              value={status}
              onChange={(value) => {
                setStatus(value as AdminReviewModerationStatus);
                setPage(1);
              }}
              options={STATUSES.map((value) => ({ value, label: text.status[value] }))}
            />
          </FilterField>
        </FilterBar>
        {error === "load" ? (
          <ErrorRecovery
            title={fa ? "صف نظرها بارگیری نشد" : "Could not load the review queue"}
            message=""
            retryLabel={fa ? "تلاش دوباره" : "Retry"}
            onRetry={() => void load()}
          />
        ) : null}
        {!data && !error ? <Skeleton className="h-64" /> : null}
        {data && data.items.length === 0 ? (
          <EmptyState title={fa ? "نظری با این فیلتر پیدا نشد" : "No reviews match these filters"} />
        ) : null}
        {data?.items.length ? (
          <ul className="divide-y divide-border-subtle">
            {data.items.map((row) => (
              <li key={row.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <strong>{row.target.name}</strong>
                    <span aria-label={`${row.rating} / 5`} className="text-state-warning">
                      {"★".repeat(row.rating)}
                    </span>
                    <Tag
                      tone={
                        row.status === "APPROVED" || row.status === "PUBLISHED"
                          ? "success"
                          : row.status === "PENDING"
                            ? "attention"
                            : "neutral"
                      }
                    >
                      {text.status[row.status]}
                    </Tag>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    {row.authorName} · {formatDay(row.createdAt.slice(0, 10), locale)}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {row.body || (fa ? "بدون متن" : "No written review")}
                  </p>
                  {row.labels.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.labels.map((label) => (
                        <Tag key={label}>{label}</Tag>
                      ))}
                    </div>
                  ) : null}
                  {row.moderationReason ? (
                    <p className="mt-2 text-sm text-text-secondary">
                      <strong>{fa ? "یادداشت تصمیم: " : "Decision note: "}</strong>
                      {row.moderationReason}
                    </p>
                  ) : null}
                </div>
                {canManage && row.status !== "HIDDEN" && row.status !== "PUBLISHED" ? (
                  <div className="flex gap-2 md:justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={row.status === "APPROVED"}
                      onClick={() => openDecision(row, "APPROVED")}
                    >
                      {fa ? "تأیید" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={row.status === "REJECTED"}
                      onClick={() => openDecision(row, "REJECTED")}
                    >
                      {fa ? "رد" : "Reject"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {data && data.total > data.pageSize ? (
          <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              {fa ? "قبلی" : "Previous"}
            </Button>
            <span className="text-sm text-text-secondary">
              {fa ? `صفحه ${data.page}` : `Page ${data.page}`}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              {fa ? "بعدی" : "Next"}
            </Button>
          </div>
        ) : null}
      </Panel>
      <Dialog
        open={Boolean(decision)}
        onClose={() => !busy && setDecision(null)}
        title={
          decision?.kind === "APPROVED"
            ? fa
              ? "تأیید نظر"
              : "Approve review"
            : fa
              ? "رد نظر"
              : "Reject review"
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {decision?.kind === "APPROVED"
              ? fa
                ? "پس از تأیید، نظر در سایت عمومی و میانگین امتیاز وارد می‌شود."
                : "Approval adds this review to public pages and rating averages."
              : fa
                ? "نظر حذف نمی‌شود؛ دلیل تصمیم و سابقهٔ ممیزی نگه‌داری می‌شود."
                : "The review is retained with its reason and audit history."}
          </p>
          <Input
            label={fa ? "برچسب‌ها (با ویرگول جدا کنید)" : "Labels (comma-separated)"}
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
          />
          <Input
            label={
              decision?.kind === "REJECTED"
                ? fa
                  ? "دلیل رد (الزامی)"
                  : "Rejection reason (required)"
                : fa
                  ? "یادداشت (اختیاری)"
                  : "Note (optional)"
            }
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {actionError ? (
            <p role="alert" className="text-sm text-state-urgent">
              {actionError}
            </p>
          ) : null}
          <Button
            isLoading={busy}
            disabled={decision?.kind === "REJECTED" && reason.trim().length < 5}
            variant={decision?.kind === "REJECTED" ? "danger" : "primary"}
            onClick={() => void submit()}
          >
            {decision?.kind === "APPROVED"
              ? fa
                ? "تأیید و انتشار"
                : "Approve and publish"
              : fa
                ? "ثبت رد"
                : "Reject review"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
