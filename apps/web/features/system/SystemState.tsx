"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button } from "@petlife/ui";

export type SystemStateKind =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ACCESS_EXPIRED"
  | "ACCESS_REVOKED"
  | "ACCESS_NOT_STARTED"
  | "LINK_EXPIRED"
  | "EXTERNAL_UNAVAILABLE"
  | "GENERIC_RETRYABLE_ERROR";

type Severity = "info" | "attention" | "blocked";

const COPY: Record<SystemStateKind, { icon: string; severity: Severity; fa: [string, string]; en: [string, string] }> = {
  AUTH_REQUIRED: { icon: "→", severity: "info", fa: ["برای ادامه وارد شوید", "این بخش مخصوص حساب شماست. پس از ورود به همین صفحه برمی‌گردید."], en: ["Sign in to continue", "This part is private to your account. You'll come back here after signing in."] },
  FORBIDDEN: { icon: "⊘", severity: "blocked", fa: ["به این بخش دسترسی ندارید", "حساب شما اجازهٔ دیدن این صفحه را ندارد. اگر باید داشته باشید، از مدیر خانواده یا صاحب آن بخواهید دسترسی بدهد."], en: ["You don't have access to this", "Your account isn't allowed to see this page. If it should be, ask the household owner or whoever manages it."] },
  NOT_FOUND: { icon: "?", severity: "info", fa: ["این صفحه پیدا نشد", "ممکن است پیوند اشتباه باشد یا این مورد حذف شده باشد."], en: ["We couldn't find that page", "The link may be wrong, or the item was removed."] },
  ACCESS_EXPIRED: { icon: "⌛", severity: "attention", fa: ["دسترسی شما به پایان رسیده است", "دسترسی موقت شما تمام شده است. اگر هنوز لازم است، از صاحب آن بخواهید دوباره دسترسی بدهد."], en: ["Your access has ended", "Your temporary access has finished. Ask the owner to share it again if you still need it."] },
  ACCESS_REVOKED: { icon: "⊘", severity: "blocked", fa: ["دسترسی شما برداشته شده است", "صاحب این بخش دسترسی شما را پایان داده است."], en: ["Your access was removed", "The owner has ended your access."] },
  ACCESS_NOT_STARTED: { icon: "⏱", severity: "info", fa: ["دسترسی شما هنوز شروع نشده است", "دسترسی شما از زمان تعیین‌شده فعال می‌شود."], en: ["Your access hasn't started yet", "Your access becomes active at the scheduled time."] },
  LINK_EXPIRED: { icon: "⌛", severity: "attention", fa: ["این پیوند دیگر معتبر نیست", "ممکن است منقضی، لغو یا قبلاً استفاده شده باشد. یک پیوند تازه درخواست کنید."], en: ["This link is no longer valid", "It may have expired, been cancelled or already been used. Ask for a fresh one."] },
  EXTERNAL_UNAVAILABLE: { icon: "⋯", severity: "attention", fa: ["این امکان فعلاً در دسترس نیست", "این بخش به سرویسی بیرونی وابسته است که هنوز متصل نشده است."], en: ["This isn't available yet", "It depends on an outside service that isn't connected yet."] },
  GENERIC_RETRYABLE_ERROR: { icon: "!", severity: "attention", fa: ["مشکلی پیش آمد", "بارگذاری انجام نشد. دوباره تلاش کنید."], en: ["Something went wrong", "This didn't load. Please try again."] },
};

export interface SystemStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

/**
 * The one grammar for "you can't be here right now" on private consumer
 * pages: a plain title, what happened, and a way forward. Copy is fixed per
 * kind — backend error text is never shown. Private routes are already
 * noindex through their layout; standalone not-found pages set it too.
 */
export function SystemState({
  kind,
  title,
  description,
  primary,
  secondary,
  onRetry,
  returnTo,
}: {
  kind: SystemStateKind;
  /** Optional safe override (still product copy, never an API message). */
  title?: string;
  description?: string;
  primary?: SystemStateAction;
  secondary?: SystemStateAction;
  onRetry?: () => void;
  returnTo?: string;
}) {
  const locale = useLocale();
  const fa = locale === "fa";
  const copy = COPY[kind];
  const [defaultTitle, defaultBody] = fa ? copy.fa : copy.en;
  const firstAction: SystemStateAction | undefined =
    primary ??
    (kind === "AUTH_REQUIRED"
      ? { label: fa ? "ورود" : "Sign in", href: `/${locale}/welcome${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}` }
      : onRetry
        ? { label: fa ? "تلاش دوباره" : "Try again", onClick: onRetry }
        : undefined);
  const secondAction: SystemStateAction = secondary ?? { label: fa ? "بازگشت به خانه" : "Go to home", href: `/${locale}/home` };

  return (
    <section className={`system-state system-state--${copy.severity}`} role={kind === "GENERIC_RETRYABLE_ERROR" ? "alert" : "status"} data-kind={kind}>
      <div className="system-state__icon" aria-hidden>
        {copy.icon}
      </div>
      <h1>{title ?? defaultTitle}</h1>
      <p>{description ?? defaultBody}</p>
      <div className="system-state__actions">
        {firstAction ? <ActionButton action={firstAction} primary /> : null}
        <ActionButton action={secondAction} />
      </div>
    </section>
  );
}

function ActionButton({ action, primary = false }: { action: SystemStateAction; primary?: boolean }) {
  if (action.href) {
    return (
      <Link className={primary ? "account-link-button" : "system-state__link"} href={action.href}>
        {action.label}
      </Link>
    );
  }
  return (
    <Button variant={primary ? "primary" : "ghost"} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

/** Maps an API failure to the matching state (403 with a lapse → expired/revoked/not started; 401 → sign in; 404 → not found). */
export function systemStateFor(error: unknown): SystemStateKind {
  const e = error as { status?: number; details?: { lapse?: { reason?: string } } } | null;
  if (!e || typeof e.status !== "number") return "GENERIC_RETRYABLE_ERROR";
  if (e.status === 401) return "AUTH_REQUIRED";
  if (e.status === 404) return "NOT_FOUND";
  if (e.status === 403) {
    const reason = e.details?.lapse?.reason;
    if (reason === "EXPIRED") return "ACCESS_EXPIRED";
    if (reason === "REVOKED") return "ACCESS_REVOKED";
    if (reason === "NOT_STARTED") return "ACCESS_NOT_STARTED";
    return "FORBIDDEN";
  }
  return "GENERIC_RETRYABLE_ERROR";
}
