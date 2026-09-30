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
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

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

  async function act(kind: "accept" | "decline") {
    setBusy(kind);
    try {
      if (kind === "accept") {
        await householdsService.acceptInvitation(token);
        router.replace(`/${locale}/profile/household`);
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

  const inviter = data.inviter?.displayName || t("یکی از نزدیکانتان", "Someone you know");
  const household = data.household.name || "PET LIFE";

  return (
    <div className="mx-auto max-w-2xl">
      <ContextSurface className="flex flex-col gap-5">
        <p className="experience-eyebrow">{t("دعوت خانواده", "HOUSEHOLD INVITATION")}</p>
        <h1 className="text-page-title">{t(`${inviter} شما را به ${household} دعوت کرده است`, `${inviter} invited you to ${household}`)}</h1>
        <p className="text-body text-text-secondary">{t("با پذیرش، حساب شما مستقل می‌ماند و فقط دسترسی‌هایی که در این دعوت آمده فعال می‌شود. مدیر خانواده بعداً می‌تواند آن را تغییر دهد و شما هر زمان می‌توانید خانواده را ترک کنید.", "Your account stays your own; only the access described in this invitation is switched on. The owner can adjust it later, and you can leave the household at any time.")}</p>
        <p className="text-metadata text-text-secondary">
          {t("انقضا", "Expires")}: <time dateTime={data.expiresAt}>{formatAccountDate(data.expiresAt, locale, true)}</time>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button isLoading={busy === "accept"} disabled={busy !== null} onClick={() => act("accept")}>{t("پذیرفتن دعوت", "Accept invitation")}</Button>
          <Button variant="secondary" isLoading={busy === "decline"} disabled={busy !== null} onClick={() => act("decline")}>{t("رد کردن", "Decline")}</Button>
        </div>
      </ContextSurface>
    </div>
  );
}
