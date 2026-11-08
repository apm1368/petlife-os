"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { householdsService } from "@/services/households.service";
import { SystemState, type SystemStateKind } from "@/features/system/SystemState";
import { formatAccountDate, useAccountCopy } from "./account-copy";

type Invitation = Awaited<ReturnType<typeof householdsService.inspectInvitation>>;
type Failure = { kind: SystemStateKind; title?: [string, string]; body?: [string, string] };

/** Maps the invitation API's codes to a safe, specific state — never its raw message. */
function invitationFailure(error: unknown): Failure {
  const code = error instanceof ApiError ? error.code : null;
  switch (code) {
    case "INVITATION_EXPIRED":
      return { kind: "LINK_EXPIRED", title: ["این دعوت منقضی شده است", "This invitation has expired"], body: ["دعوت‌ها ۷ روز اعتبار دارند. از کسی که شما را دعوت کرده بخواهید دعوت تازه‌ای بفرستد.", "Invitations last 7 days. Ask the person who invited you to send a new one."] };
    case "INVITATION_ALREADY_USED":
      return { kind: "LINK_EXPIRED", title: ["به این دعوت قبلاً پاسخ داده شده است", "This invitation was already answered"], body: ["اگر آن را پذیرفته‌اید، خانواده را در بخش حساب می‌بینید.", "If you accepted it, you'll find the household in your account."] };
    case "INVITATION_REVOKED":
      return { kind: "ACCESS_REVOKED", title: ["این دعوت لغو شده است", "This invitation was cancelled"], body: ["خانواده این دعوت را پس گرفته است.", "The household withdrew this invitation."] };
    case "INVITATION_NOT_FOR_YOU":
      return { kind: "FORBIDDEN", title: ["این دعوت برای حساب دیگری است", "This invitation is for a different account"], body: ["دعوت به ایمیل یا موبایل دیگری فرستاده شده است. با همان ایمیل یا موبایل وارد شوید.", "It was sent to another email or phone number. Sign in with that one to open it."] };
    case "NOT_FOUND":
      return { kind: "NOT_FOUND", title: ["این دعوت پیدا نشد", "We couldn't find this invitation"], body: ["پیوند ممکن است ناقص باشد. پیوند کامل را دوباره باز کنید یا دعوت تازه بخواهید.", "The link may be incomplete. Open the full link again or ask for a new invitation."] };
    default:
      if (error instanceof ApiError && error.status === 401) return { kind: "AUTH_REQUIRED" };
      return { kind: "GENERIC_RETRYABLE_ERROR" };
  }
}

/**
 * Household invitation. The household and inviter are only shown once the
 * API confirms the invitation is live and addressed to this account; every
 * failure (expired, already answered, cancelled, someone else's, unknown)
 * has its own plain explanation, and accept/decline errors are never
 * swallowed.
 */
export function HouseholdInvitationView({ token }: { token: string }) {
  const { t, locale } = useAccountCopy();
  const router = useRouter();
  const [data, setData] = useState<Invitation | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState<"request" | "decline" | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try {
      setData(await householdsService.inspectInvitation(token));
    } catch (err) {
      setFailure(invitationFailure(err));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(kind: "request" | "decline") {
    setBusy(kind);
    try {
      if (kind === "request") {
        await householdsService.requestMembership(token);
        setRequestSubmitted(true);
      } else {
        await householdsService.declineInvitation(token);
        router.replace(`/${locale}/profile`);
      }
    } catch (err) {
      setData(null);
      setFailure(invitationFailure(err));
    } finally {
      setBusy(null);
    }
  }

  if (failure) {
    return (
      <SystemState
        kind={failure.kind}
        title={failure.title ? t(failure.title[0], failure.title[1]) : undefined}
        description={failure.body ? t(failure.body[0], failure.body[1]) : undefined}
        onRetry={failure.kind === "GENERIC_RETRYABLE_ERROR" ? () => void load() : undefined}
        returnTo={`/${locale}/invitations/${token}`}
        secondary={{ label: t("رفتن به حساب", "Go to your account"), href: `/${locale}/profile` }}
      />
    );
  }
  if (!data) return <Skeleton className="h-72 w-full" aria-label={t("در حال بارگذاری", "Loading")} />;

  const pending = requestSubmitted || data.requestPending;

  return (
    <div className="mx-auto max-w-2xl">
      <ContextSurface className="flex flex-col gap-5">
        <p className="experience-eyebrow">{t("درخواست عضویت خانوادگی", "HOUSEHOLD MEMBERSHIP REQUEST")}</p>
        <h1 className="text-page-title">{pending ? t("درخواست شما در انتظار بررسی مدیر خانواده است", "Your request is waiting for the household owner") : t("درخواست پیوستن به یک خانواده", "Request to join a household")}</h1>
        <p className="text-body text-text-secondary">{t("شمارهٔ واردشده در دعوت: ", "Invited mobile: ")}<bdi dir="ltr">{data.contactMasked}</bdi></p>
        <p className="text-body text-text-secondary">{data.phoneVerified
          ? t("شمارهٔ این حساب تأیید شده است؛ با این حال عضویت و دسترسی به پت‌ها فقط پس از تأیید مدیر خانواده فعال می‌شود.", "This account's mobile is verified. Household membership and pet access still begin only after the owner approves.")
          : t("این شماره در حساب شما تأیید نشده است. تطبیق شماره اثبات مالکیت آن نیست؛ این پیوند فقط درخواست عضویت می‌سازد و تا تأیید مدیر هیچ دسترسی خانوادگی یا اطلاعات پت فعال نمی‌شود.", "This account's mobile is not verified. A matching number does not prove ownership; this link only submits a request, and no household access or pet information is available before owner approval.")}</p>
        <p className="text-metadata text-text-secondary">
          {t("انقضا", "Expires")}: <time dateTime={data.expiresAt}>{formatAccountDate(data.expiresAt, locale, true)}</time>
        </p>
        {pending ? <p role="status" className="rounded-xl border border-border-subtle p-3 text-body">{t("درخواست ثبت شده است. پس از تصمیم مدیر خانواده، نتیجه در همین حساب قابل پیگیری است.", "Your request was submitted. You can follow the owner's decision in your account.")}</p> : <div className="flex flex-wrap gap-2">
          <Button isLoading={busy === "request"} disabled={busy !== null} onClick={() => act("request")}>{t("درخواست عضویت", "Request membership")}</Button>
          <Button variant="secondary" isLoading={busy === "decline"} disabled={busy !== null} onClick={() => act("decline")}>{t("رد کردن دعوت", "Decline invitation")}</Button>
        </div>}
      </ContextSurface>
    </div>
  );
}
